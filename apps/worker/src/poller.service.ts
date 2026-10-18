import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PrismaService } from '@evals/db';
import { WORKER_ENV, type WorkerEnv } from './env';
import { ExperimentRunner } from './experiment-runner.service';

export const HEARTBEAT_ID = 'worker';
const HEARTBEAT_MS = 10_000;

@Injectable()
export class PollerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PollerService.name);
  private stopped = false;
  private timer: NodeJS.Timeout | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private loop: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: ExperimentRunner,
    @Inject(WORKER_ENV) private readonly env: WorkerEnv,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.failOrphans();
    await this.beat();
    this.heartbeat = setInterval(() => void this.beat(), HEARTBEAT_MS);
    this.schedule(0);
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    await this.runner.shutdown();
    await this.loop;
  }

  /**
   * Claims the oldest queued experiment. `FOR UPDATE SKIP LOCKED` keeps a second worker from
   * claiming the same one.
   */
  async claim(): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE "Experiment" SET status = 'running'
      WHERE id = (
        SELECT id FROM "Experiment" WHERE status = 'queued'
        ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      RETURNING id`;
    return rows[0]?.id ?? null;
  }

  /** One poll: claim and run at most one experiment. Returns the experiment id it ran. */
  async tick(): Promise<string | null> {
    const id = await this.claim();
    if (id) await this.runner.run(id);
    return id;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.loop = this.tick()
        .then((ran) => this.schedule(ran ? 0 : this.env.POLL_INTERVAL_MS))
        .catch((error: unknown) => {
          this.logger.error(error instanceof Error ? error.stack : String(error));
          this.schedule(this.env.POLL_INTERVAL_MS);
        });
    }, delayMs);
  }

  /** A `running` experiment at startup belonged to a worker that died; its Harbor job is gone. */
  private async failOrphans(): Promise<void> {
    const { count } = await this.prisma.experiment.updateMany({
      where: { status: 'running' },
      data: {
        status: 'failed',
        error: 'worker restarted while the experiment was running',
        finishedAt: new Date(),
      },
    });
    if (count) this.logger.warn(`marked ${count} orphaned running experiment(s) as failed`);
  }

  private async beat(): Promise<void> {
    try {
      await this.prisma.workerHeartbeat.upsert({
        where: { id: HEARTBEAT_ID },
        create: { id: HEARTBEAT_ID },
        update: { updatedAt: new Date() },
      });
    } catch (error) {
      this.logger.warn(`heartbeat failed: ${String(error)}`);
    }
  }
}
