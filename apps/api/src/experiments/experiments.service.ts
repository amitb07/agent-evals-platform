import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ensureTrialMatrix, type Prisma, PrismaService, type TrialStatus } from '@evals/db';
import {
  factorViolation,
  type Arm,
  type Experiment,
  type ExperimentDetail,
  type ExperimentSummary,
  type TrialSummary,
  type TrialsQuery,
} from '@evals/shared';
import { API_ENV, type ApiEnv } from '../config';
import { iso, toAgentConfig } from '../common/mappers';

const FINISHED: TrialStatus[] = ['graded', 'failed', 'ingest_failed'];

const summaryInclude = {
  baselineConfig: { select: { slug: true } },
  candidateConfig: { select: { slug: true } },
  _count: { select: { tasks: true } },
} satisfies Prisma.ExperimentInclude;

type SummaryRow = Prisma.ExperimentGetPayload<{ include: typeof summaryInclude }>;

interface Progress {
  done: number;
  total: number;
  spendUsd: number;
}

@Injectable()
export class ExperimentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: Pick<ApiEnv, 'ANTHROPIC_API_KEY'>,
  ) {}

  async list(): Promise<ExperimentSummary[]> {
    const [rows, groups] = await Promise.all([
      this.prisma.experiment.findMany({ include: summaryInclude, orderBy: { createdAt: 'desc' } }),
      this.prisma.trial.groupBy({
        by: ['experimentId', 'status'],
        _count: { _all: true },
        _sum: { costUsd: true },
      }),
    ]);
    const progress = new Map<string, Progress>();
    for (const g of groups) {
      const p = progress.get(g.experimentId) ?? { done: 0, total: 0, spendUsd: 0 };
      p.total += g._count._all;
      if (FINISHED.includes(g.status)) p.done += g._count._all;
      p.spendUsd += g._sum.costUsd ?? 0;
      progress.set(g.experimentId, p);
    }
    return rows.map((row) => toSummary(row, progress.get(row.id)));
  }

  async get(id: string): Promise<ExperimentDetail> {
    const row = await this.prisma.experiment.findUnique({
      where: { id },
      include: {
        ...summaryInclude,
        tasks: { include: { task: true }, orderBy: { position: 'asc' } },
        trials: {
          select: {
            taskId: true,
            arm: true,
            status: true,
            rewardValid: true,
            score: true,
            costUsd: true,
          },
        },
      },
    });
    if (!row) throw new NotFoundException(`Experiment ${id} not found`);

    const arm = (taskId: string, a: Arm) => {
      const trials = row.trials.filter((t) => t.taskId === taskId && t.arm === a);
      const valid = trials.filter(
        (t) => FINISHED.includes(t.status) && t.rewardValid && t.score !== null,
      );
      const scores = valid.map((t) => t.score!);
      return {
        trials: trials.length,
        valid: valid.length,
        passes: scores.filter((s) => s >= row.passThreshold).length,
        meanScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
        costUsd: trials.reduce((sum, t) => sum + (t.costUsd ?? 0), 0),
      };
    };
    const progress: Progress = {
      done: row.trials.filter((t) => FINISHED.includes(t.status)).length,
      total: row.trials.length,
      spendUsd: row.trials.reduce((sum, t) => sum + (t.costUsd ?? 0), 0),
    };
    return {
      ...toSummary(row, progress),
      hypothesis: row.hypothesis,
      stopRequested: row.stopRequested,
      repeats: row.repeats,
      concurrency: row.concurrency,
      passThreshold: row.passThreshold,
      costCapUsd: row.costCapUsd,
      seed: row.seed,
      heldOutTaskIds: row.heldOutTaskIds,
      error: row.error,
      startedAt: iso(row.startedAt),
      finishedAt: iso(row.finishedAt),
      tasks: row.tasks.map(({ task }) => ({
        taskId: task.id,
        taskSlug: task.slug,
        title: task.title,
        category: task.category,
        A: arm(task.id, 'A'),
        B: arm(task.id, 'B'),
      })),
    };
  }

  /** Creates a `draft` from the same shape as `experiments/*.yaml`, with the same checks as sync. */
  async create(input: Experiment): Promise<ExperimentDetail> {
    if (await this.prisma.experiment.findUnique({ where: { slug: input.id } })) {
      throw new ConflictException(`Experiment ${input.id} already exists`);
    }
    const [baseline, candidate, tasks] = await Promise.all([
      this.prisma.agentConfig.findUnique({ where: { slug: input.baselineConfigId } }),
      this.prisma.agentConfig.findUnique({ where: { slug: input.candidateConfigId } }),
      this.prisma.task.findMany({ where: { slug: { in: input.taskIds } } }),
    ]);
    const issues: string[] = [];
    if (!baseline) issues.push(`Unknown baseline config ${input.baselineConfigId}`);
    if (!candidate) issues.push(`Unknown candidate config ${input.candidateConfigId}`);
    const known = new Map(tasks.map((t) => [t.slug, t.id]));
    for (const slug of input.taskIds) if (!known.has(slug)) issues.push(`Unknown task ${slug}`);
    if (baseline && candidate) {
      const violation = factorViolation(
        input.factor,
        toAgentConfig(baseline),
        toAgentConfig(candidate),
      );
      if (violation) issues.push(violation);
    }
    if (issues.length)
      throw new BadRequestException({ error: 'Invalid experiment', details: issues });

    const created = await this.prisma.experiment.create({
      data: {
        slug: input.id,
        name: input.name,
        hypothesis: input.hypothesis,
        factor: input.factor,
        repeats: input.repeats,
        concurrency: input.concurrency,
        passThreshold: input.passThreshold,
        costCapUsd: input.costCapUsd,
        seed: input.seed,
        heldOutTaskIds: input.heldOutTaskIds,
        baselineConfigId: baseline!.id,
        candidateConfigId: candidate!.id,
        tasks: {
          create: input.taskIds.map((slug, position) => ({ taskId: known.get(slug)!, position })),
        },
      },
    });
    return this.get(created.id);
  }

  /** `draft → queued` and creates the pending Trial matrix in the same transaction. */
  async run(id: string): Promise<ExperimentDetail> {
    if (!this.env.ANTHROPIC_API_KEY) {
      throw new BadRequestException('ANTHROPIC_API_KEY is not configured; add it to .env');
    }
    const experiment = await this.require(id);
    if (experiment.costCapUsd <= 0) throw new BadRequestException('Cost cap must be positive');
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.experiment.updateMany({
        where: { id, status: 'draft' },
        data: { status: 'queued', stopRequested: false, error: null },
      });
      if (count === 0) {
        throw new ConflictException(`Experiment is ${experiment.status}; only a draft can run`);
      }
      await ensureTrialMatrix(tx, id);
    });
    return this.get(id);
  }

  /**
   * A queued experiment goes back to `draft` (the worker has not claimed it) and loses its matrix. A running one gets
   * `stopRequested`; the worker stops Harbor and marks it `completed` with "stopped by user".
   */
  async stop(id: string): Promise<ExperimentDetail> {
    await this.require(id);
    const unqueued = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.experiment.updateMany({
        where: { id, status: 'queued' },
        data: { status: 'draft' },
      });
      // Never claimed, so every trial is still pending; a draft has no matrix.
      if (count) await tx.trial.deleteMany({ where: { experimentId: id, status: 'pending' } });
      return { count };
    });
    if (unqueued.count === 0) {
      const { count } = await this.prisma.experiment.updateMany({
        where: { id, status: 'running' },
        data: { stopRequested: true },
      });
      if (count === 0) throw new ConflictException('Only a queued or running experiment can stop');
    }
    return this.get(id);
  }

  async trials(id: string, query: TrialsQuery): Promise<TrialSummary[]> {
    await this.require(id);
    const rows = await this.prisma.trial.findMany({
      where: { experimentId: id, taskId: query.taskId, arm: query.arm },
      include: { task: { select: { slug: true } } },
      orderBy: [{ task: { slug: 'asc' } }, { arm: 'asc' }, { repeatIndex: 'asc' }],
    });
    return rows.map(toTrialSummary);
  }

  private async require(id: string) {
    const experiment = await this.prisma.experiment.findUnique({ where: { id } });
    if (!experiment) throw new NotFoundException(`Experiment ${id} not found`);
    return experiment;
  }
}

function toSummary(row: SummaryRow, progress: Progress | undefined): ExperimentSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    factor: row.factor,
    baselineConfig: row.baselineConfig.slug,
    candidateConfig: row.candidateConfig.slug,
    status: row.status,
    // Before the matrix exists (draft), the total is what running would create.
    progress: {
      done: progress?.done ?? 0,
      total: progress?.total || row._count.tasks * 2 * row.repeats,
    },
    spendUsd: progress?.spendUsd ?? 0,
    createdAt: row.createdAt.toISOString(),
  };
}

type TrialRow = Prisma.TrialGetPayload<{ include: { task: { select: { slug: true } } } }>;

export function toTrialSummary(t: TrialRow): TrialSummary {
  return {
    id: t.id,
    taskId: t.taskId,
    taskSlug: t.task.slug,
    arm: t.arm,
    repeatIndex: t.repeatIndex,
    attempt: t.attempt,
    status: t.status,
    failureCause: t.failureCause,
    rewardValid: t.rewardValid,
    score: t.score,
    passed: t.passed,
    costUsd: t.costUsd,
    durationMs: t.durationMs,
    startedAt: iso(t.startedAt),
  };
}
