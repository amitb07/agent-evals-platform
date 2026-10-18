import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Prisma, PrismaService } from '@evals/db';
import type { AgentConfig, Experiment, Task } from '@evals/shared';
import { type Loaded, loadRepo } from './sync.loader';

export const REPO_DIR = Symbol('REPO_DIR');

export interface SyncCounts {
  created: number;
  updated: number;
  unchanged: number;
}

export interface SyncResult {
  tasks: SyncCounts;
  configs: SyncCounts;
  experiments: SyncCounts & { locked: string[] };
}

type Tx = Prisma.TransactionClient;

const emptyCounts = (): SyncCounts => ({ created: 0, updated: 0, unchanged: 0 });

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REPO_DIR) private readonly repoDir: string,
  ) {}

  async run(): Promise<SyncResult> {
    const repo = await loadRepo(this.repoDir);
    const result = await this.prisma.$transaction(async (tx) => ({
      tasks: await this.syncTasks(tx, repo.tasks),
      configs: await this.syncConfigs(tx, repo.configs),
      experiments: await this.syncExperiments(tx, repo.experiments),
    }));
    this.logger.log(`Synced ${this.repoDir}: ${JSON.stringify(result)}`);
    return result;
  }

  private async syncTasks(tx: Tx, tasks: Loaded<Task>[]): Promise<SyncCounts> {
    const hashes = new Map(
      (await tx.task.findMany({ select: { slug: true, yamlHash: true } })).map((t) => [
        t.slug,
        t.yamlHash,
      ]),
    );
    const counts = emptyCounts();
    for (const { hash, value: task } of tasks) {
      const previous = hashes.get(task.id);
      if (previous === hash) {
        counts.unchanged++;
        continue;
      }
      const data = {
        yamlHash: hash,
        title: task.title,
        category: task.category,
        prompt: task.prompt,
        fixtures: task.fixtures,
        graders: task.graders as Prisma.InputJsonValue,
        timeoutSec: task.timeoutSec,
        tags: task.tags,
      };
      await tx.task.upsert({
        where: { slug: task.id },
        create: { slug: task.id, ...data },
        update: data,
      });
      counts[previous === undefined ? 'created' : 'updated']++;
    }
    return counts;
  }

  private async syncConfigs(tx: Tx, configs: Loaded<AgentConfig>[]): Promise<SyncCounts> {
    const hashes = new Map(
      (await tx.agentConfig.findMany({ select: { slug: true, yamlHash: true } })).map((c) => [
        c.slug,
        c.yamlHash,
      ]),
    );
    const counts = emptyCounts();
    for (const { hash, value: config } of configs) {
      const previous = hashes.get(config.id);
      if (previous === hash) {
        counts.unchanged++;
        continue;
      }
      const data = {
        yamlHash: hash,
        name: config.name,
        hermesImageDigest: config.hermesImageDigest,
        model: config.model,
        provider: config.provider,
        skills: config.skills,
        toolsets: config.toolsets,
        memory: config.memory,
        maxTurns: config.maxTurns,
      };
      await tx.agentConfig.upsert({
        where: { slug: config.id },
        create: { slug: config.id, ...data },
        update: data,
      });
      counts[previous === undefined ? 'created' : 'updated']++;
    }
    return counts;
  }

  private async syncExperiments(
    tx: Tx,
    experiments: Loaded<Experiment>[],
  ): Promise<SyncResult['experiments']> {
    const existing = new Map(
      (await tx.experiment.findMany({ select: { slug: true, yamlHash: true, status: true } })).map(
        (e) => [e.slug, e],
      ),
    );
    const taskIds = new Map(
      (await tx.task.findMany({ select: { id: true, slug: true } })).map((t) => [t.slug, t.id]),
    );
    const configIds = new Map(
      (await tx.agentConfig.findMany({ select: { id: true, slug: true } })).map((c) => [
        c.slug,
        c.id,
      ]),
    );
    const idOf = (ids: Map<string, string>, slug: string): string => {
      const id = ids.get(slug);
      if (!id) throw new Error(`Unknown slug "${slug}"`);
      return id;
    };

    const result = { ...emptyCounts(), locked: [] as string[] };
    for (const { hash, value: experiment } of experiments) {
      const previous = existing.get(experiment.id);
      if (previous?.yamlHash === hash) {
        result.unchanged++;
        continue;
      }
      if (previous && previous.status !== 'draft') {
        result.locked.push(experiment.id);
        continue;
      }
      const data = {
        yamlHash: hash,
        name: experiment.name,
        hypothesis: experiment.hypothesis,
        factor: experiment.factor,
        repeats: experiment.repeats,
        concurrency: experiment.concurrency,
        passThreshold: experiment.passThreshold,
        costCapUsd: experiment.costCapUsd,
        seed: experiment.seed,
        heldOutTaskIds: experiment.heldOutTaskIds,
        baselineConfigId: idOf(configIds, experiment.baselineConfigId),
        candidateConfigId: idOf(configIds, experiment.candidateConfigId),
      };
      const tasks = experiment.taskIds.map((slug, position) => ({
        taskId: idOf(taskIds, slug),
        position,
      }));
      await tx.experiment.upsert({
        where: { slug: experiment.id },
        create: { slug: experiment.id, ...data, tasks: { create: tasks } },
        update: { ...data, tasks: { deleteMany: {}, create: tasks } },
      });
      result[previous ? 'updated' : 'created']++;
    }
    return result;
  }
}
