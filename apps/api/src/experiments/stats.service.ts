import { Injectable, NotFoundException } from '@nestjs/common';
import { type Prisma, PrismaService } from '@evals/db';
import type { ExperimentStats } from '@evals/shared';
import { computeStats } from '@evals/stats';

interface Snapshot {
  basis: string;
  stats: ExperimentStats;
}

/**
 * Computes §10 statistics on read and caches them in `StatsSnapshot`. The cache key (`basis`)
 * includes the number of ingested trials, which only grows, so a snapshot computed concurrently
 * with an ingest pass can never be served after it.
 */
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(experimentId: string): Promise<ExperimentStats> {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId },
      include: {
        tasks: { include: { task: true }, orderBy: { position: 'asc' } },
        stats: true,
      },
    });
    if (!experiment) throw new NotFoundException(`Experiment ${experimentId} not found`);
    const ingested = await this.prisma.trial.count({
      where: { experimentId, harborTrialName: { not: null } },
    });
    const tasks = experiment.tasks.map(({ task }) => ({
      slug: task.slug,
      category: task.category,
      heldOut: experiment.heldOutTaskIds.includes(task.slug),
    }));
    const basis = JSON.stringify({
      ingested,
      tasks,
      repeats: experiment.repeats,
      passThreshold: experiment.passThreshold,
      seed: experiment.seed,
    });
    const cached = experiment.stats?.json as Snapshot | undefined;
    if (cached?.basis === basis) return cached.stats;

    const trials = await this.prisma.trial.findMany({
      where: { experimentId },
      include: { task: { select: { slug: true } } },
    });
    const stats = computeStats({
      tasks,
      repeats: experiment.repeats,
      passThreshold: experiment.passThreshold,
      seed: experiment.seed,
      trials: trials.map((t) => ({ ...t, taskSlug: t.task.slug })),
    });
    const json = { basis, stats } satisfies Snapshot as unknown as Prisma.InputJsonObject;
    await this.prisma.statsSnapshot.upsert({
      where: { experimentId },
      create: { experimentId, json },
      update: { json, computedAt: new Date() },
    });
    return stats;
  }
}
