import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ensureTrialMatrix, type ExperimentStatus, PrismaService } from '@evals/db';
import { WORKER_ENV, type WorkerEnv } from './env';
import { lastLines, type HarborHandle, type HarborLauncher } from './harbor/process';
import { IngestService, type IngestContext } from './ingest/ingest.service';
import { prepareJob } from './prepare';

export const HARBOR_LAUNCHER = Symbol('HARBOR_LAUNCHER');

type StopReason = 'budget' | 'user';

@Injectable()
export class ExperimentRunner {
  private readonly logger = new Logger(ExperimentRunner.name);
  private current: HarborHandle | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingest: IngestService,
    @Inject(WORKER_ENV) private readonly env: WorkerEnv,
    @Inject(HARBOR_LAUNCHER) private readonly launcher: HarborLauncher,
  ) {}

  /** Stops the running Harbor job, if any (worker shutdown). */
  async shutdown(): Promise<void> {
    await this.current?.stop(10_000);
  }

  /** Runs one claimed (`running`) experiment to a terminal status. Never throws. */
  async run(experimentId: string): Promise<ExperimentStatus> {
    const log = (message: string): void => this.logger.log({ experimentId, message });
    try {
      return await this.runUnsafe(experimentId, log);
    } catch (error) {
      const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
      this.logger.error({ experimentId, message });
      await this.finish(experimentId, 'failed', message);
      return 'failed';
    } finally {
      this.current = null;
    }
  }

  private async runUnsafe(
    experimentId: string,
    log: (m: string) => void,
  ): Promise<ExperimentStatus> {
    const experiment = await this.prisma.experiment.findUniqueOrThrow({
      where: { id: experimentId },
      include: {
        baselineConfig: true,
        candidateConfig: true,
        tasks: { include: { task: true }, orderBy: { position: 'asc' } },
      },
    });
    const total = await ensureTrialMatrix(this.prisma, experimentId);
    const job = await prepareJob(experiment, this.env);
    const ctx: IngestContext = {
      experimentId,
      job,
      taskIds: new Map(experiment.tasks.map(({ task }) => [task.slug, task.id])),
    };
    await this.prisma.experiment.update({
      where: { id: experimentId },
      data: { harborJobName: job.jobName, jobDir: job.jobDir, startedAt: new Date() },
    });

    const logPath = join(job.jobDir, 'harbor.log');
    log(`starting Harbor job ${job.jobName}: ${total} trials`);
    const handle = this.launcher.launch({
      bin: this.env.HARBOR_BIN,
      jobConfigPath: job.jobConfigPath,
      jobsDir: job.jobDir,
      logPath,
      env: this.harborEnv(),
    });
    this.current = handle;

    let exitCode: number | null | undefined;
    void handle.exited.then(
      (code) => (exitCode = code),
      () => (exitCode = null),
    );
    let stopReason: StopReason | null = null;
    while (exitCode === undefined) {
      await Promise.race([handle.exited.catch(() => null), sleep(this.env.POLL_INTERVAL_MS)]);
      const pass = await this.ingest.ingest(ctx, exitCode === undefined);
      if (pass.ingested) log(`ingested ${pass.ingested} trial(s)`);
      if (!stopReason && exitCode === undefined) {
        stopReason = await this.stopReason(experimentId, experiment.costCapUsd);
        if (stopReason) {
          log(
            `stopping Harbor: ${stopReason === 'budget' ? 'cost cap reached' : 'stop requested'}`,
          );
          await handle.stop();
        }
      }
    }
    await handle.exited.catch((error: unknown) => {
      throw new Error(`Harbor could not be started: ${String(error)}`);
    });
    await this.ingest.ingest(ctx, false);

    if (stopReason === 'budget') return this.finish(experimentId, 'stopped_budget', null);
    if (stopReason === 'user') return this.finish(experimentId, 'completed', 'stopped by user');
    const ingested = await this.prisma.trial.count({
      where: { experimentId, harborTrialName: { not: null } },
    });
    if (exitCode !== 0 && ingested === 0) {
      return this.finish(
        experimentId,
        'failed',
        `Harbor exited with ${exitCode}:\n${await lastLines(logPath, 50)}`,
      );
    }
    log(`Harbor exited with ${exitCode}; ${ingested}/${total} trials ingested`);
    return this.finish(
      experimentId,
      'completed',
      exitCode === 0 ? null : `Harbor exited with ${exitCode}`,
    );
  }

  private harborEnv(): NodeJS.ProcessEnv {
    const adapterDir = this.env.ADAPTER_DIR ?? this.env.REPO_DIR;
    const pythonPath = [adapterDir, process.env.PYTHONPATH].filter(Boolean).join(':');
    return { ...process.env, PYTHONPATH: pythonPath, JUDGE_MODEL: this.env.JUDGE_MODEL };
  }

  private async stopReason(experimentId: string, costCapUsd: number): Promise<StopReason | null> {
    const [experiment, spend] = await Promise.all([
      this.prisma.experiment.findUniqueOrThrow({
        where: { id: experimentId },
        select: { stopRequested: true },
      }),
      this.prisma.trial.aggregate({ where: { experimentId }, _sum: { costUsd: true } }),
    ]);
    if ((spend._sum.costUsd ?? 0) >= costCapUsd) return 'budget';
    if (experiment.stopRequested) return 'user';
    return null;
  }

  private async finish(
    experimentId: string,
    status: ExperimentStatus,
    error: string | null,
  ): Promise<ExperimentStatus> {
    await this.prisma.experiment.update({
      where: { id: experimentId },
      data: { status, error, finishedAt: new Date() },
    });
    this.logger.log({ experimentId, message: `experiment ${status}` });
    return status;
  }
}
