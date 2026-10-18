import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Prisma, PrismaService } from '@evals/db';
import { armSchema } from '@evals/shared';
import { WORKER_ENV, type WorkerEnv } from '../env';
import type { PreparedJob } from '../prepare';
import { storeTrialFiles } from './files';
import { readTrialDir, type TrialRecord } from './trial-dir';

export interface IngestContext {
  experimentId: string;
  job: PreparedJob;
  /** Task slug → Task id for this experiment. */
  taskIds: ReadonlyMap<string, string>;
}

export interface IngestPass {
  ingested: number;
  waiting: number;
  failed: number;
}

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WORKER_ENV) private readonly env: WorkerEnv,
  ) {}

  /**
   * One pass over `<jobDir>/<jobName>/*`. Each finished, final trial fills the next `pending` Trial
   * row for its (task, arm); `harborTrialName` makes the pass idempotent.
   */
  async ingest(ctx: IngestContext, harborRunning: boolean): Promise<IngestPass> {
    const pass: IngestPass = { ingested: 0, waiting: 0, failed: 0 };
    const done = new Set(
      (
        await this.prisma.trial.findMany({
          where: { experimentId: ctx.experimentId, harborTrialName: { not: null } },
          select: { harborTrialName: true },
        })
      ).map((t) => t.harborTrialName),
    );
    const entries = await readdir(ctx.job.trialsDir, { withFileTypes: true }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      },
    );
    for (const entry of entries
      .filter((e) => e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      if (done.has(entry.name)) continue;
      const trialDir = join(ctx.job.trialsDir, entry.name);
      const log = { experimentId: ctx.experimentId, harborTrialName: entry.name };
      try {
        const state = await readTrialDir(trialDir, harborRunning);
        if (state.state === 'not_ready') {
          pass.waiting++;
          continue;
        }
        await this.store(ctx, trialDir, state.record);
        pass.ingested++;
      } catch (error) {
        pass.failed++;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error({ ...log, message: `ingest failed: ${message}` });
        if (!harborRunning) await this.markIngestFailed(ctx, trialDir, entry.name, message);
      }
    }
    if (pass.ingested > 0) {
      await this.prisma.statsSnapshot.deleteMany({ where: { experimentId: ctx.experimentId } });
    }
    return pass;
  }

  private async nextSlot(ctx: IngestContext, taskSlug: string, arm: 'A' | 'B') {
    const taskId = ctx.taskIds.get(taskSlug);
    if (!taskId) throw new Error(`Task ${taskSlug} is not part of this experiment`);
    const slot = await this.prisma.trial.findFirst({
      where: { experimentId: ctx.experimentId, taskId, arm, harborTrialName: null },
      orderBy: { repeatIndex: 'asc' },
    });
    if (!slot) throw new Error(`No pending trial left for ${taskSlug} arm ${arm}`);
    return slot;
  }

  private async store(ctx: IngestContext, trialDir: string, r: TrialRecord): Promise<void> {
    const slot = await this.nextSlot(ctx, r.taskSlug, r.arm);
    const destDir = join(this.env.DATA_DIR, 'trials', slot.id);
    const secrets = this.env.ANTHROPIC_API_KEY ? [this.env.ANTHROPIC_API_KEY] : [];
    const paths = await storeTrialFiles(trialDir, destDir, this.env.DATA_DIR, secrets);
    const manifest = {
      ...ctx.job.manifestBase,
      trial: {
        harborTrialName: r.trialName,
        taskSlug: r.taskSlug,
        arm: r.arm,
        configSlug: ctx.job.arms[r.arm].configSlug,
        homeBundleHash: ctx.job.arms[r.arm].homeBundleHash,
        repeatIndex: slot.repeatIndex,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        exceptionType: r.result.exception_info?.exception_type ?? null,
      },
    };
    const g = r.grades;
    const data: Prisma.TrialUpdateManyMutationInput = {
      harborTrialName: r.trialName,
      harborTrialDir: trialDir,
      status: g ? 'graded' : 'failed',
      failureCause: r.failureCause,
      rewardValid: r.rewardValid,
      turnExitReason: r.turnExitReason,
      exitCode: r.exitCode,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      durationMs: r.durationMs,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      cacheRead: r.cacheRead,
      costUsd: r.costUsd,
      // A valid failure without grades (e.g. the verifier never ran) scores 0.
      score: g?.score ?? (r.rewardValid ? 0 : null),
      gatePassed: g?.gatePassed ?? (r.rewardValid ? false : null),
      passed: g?.passed ?? (r.rewardValid ? false : null),
      error: r.error,
      ...paths,
    };
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.trial.updateMany({
        where: { id: slot.id, harborTrialName: null },
        data,
      });
      if (updated.count !== 1) throw new Error(`Trial ${slot.id} was filled concurrently`);
      if (g) {
        await tx.grade.createMany({
          data: g.checks.map((c) => ({
            trialId: slot.id,
            graderId: c.graderId,
            type: c.type,
            score: c.score,
            passed: c.passed,
            gate: c.gate,
            reason: c.reason,
            evidence: c.evidence,
          })),
        });
      }
      await tx.runManifest.create({
        data: { trialId: slot.id, json: manifest },
      });
    });
  }

  /**
   * After Harbor exits, a trial that still cannot be read is recorded as `ingest_failed` instead of
   * retried forever. Task and arm come from the trial name and Harbor's `config.json`; if either is
   * unknown the trial cannot be attributed and only the worker log has the error.
   */
  private async markIngestFailed(
    ctx: IngestContext,
    trialDir: string,
    trialName: string,
    message: string,
  ): Promise<void> {
    const taskSlug = /^(.+)__[^_]+$/.exec(trialName)?.[1];
    const taskId = taskSlug ? ctx.taskIds.get(taskSlug) : undefined;
    const arm = await readFile(join(trialDir, 'config.json'), 'utf8')
      .then((text) => armSchema.safeParse((JSON.parse(text) as TrialConfigJson).agent?.kwargs?.arm))
      .catch(() => null);
    if (!taskId || !arm?.success) return;
    const slot = await this.prisma.trial.findFirst({
      where: { experimentId: ctx.experimentId, taskId, arm: arm.data, harborTrialName: null },
      orderBy: { repeatIndex: 'asc' },
    });
    if (!slot) return;
    await this.prisma.trial.update({
      where: { id: slot.id },
      data: {
        harborTrialName: trialName,
        harborTrialDir: trialDir,
        status: 'ingest_failed',
        error: message,
      },
    });
  }
}

interface TrialConfigJson {
  agent?: { kwargs?: { arm?: unknown } };
}
