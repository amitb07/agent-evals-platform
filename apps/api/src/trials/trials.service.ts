import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, type Trial } from '@evals/db';
import type { TrialDetail, TrialFile } from '@evals/shared';
import { API_ENV, type ApiEnv } from '../config';
import { iso } from '../common/mappers';
import { toTrialSummary } from '../experiments/experiments.service';
import {
  diffTrees,
  listFiles,
  parseJsonLines,
  resolveInside,
  UnsafePathError,
} from './trial-files';

type PathColumn = 'eventsPath' | 'sessionPath' | 'workspacePath';

@Injectable()
export class TrialsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: Pick<ApiEnv, 'DATA_DIR'>,
  ) {}

  async get(id: string): Promise<TrialDetail> {
    const t = await this.prisma.trial.findUnique({
      where: { id },
      include: {
        task: { select: { slug: true, prompt: true } },
        config: { select: { slug: true } },
        grades: { orderBy: { graderId: 'asc' } },
        manifest: true,
      },
    });
    if (!t) throw new NotFoundException(`Trial ${id} not found`);
    return {
      ...toTrialSummary(t),
      experimentId: t.experimentId,
      configSlug: t.config.slug,
      prompt: t.task.prompt,
      turnExitReason: t.turnExitReason,
      exitCode: t.exitCode,
      tokensIn: t.tokensIn,
      tokensOut: t.tokensOut,
      cacheRead: t.cacheRead,
      gatePassed: t.gatePassed,
      error: t.error,
      finishedAt: iso(t.finishedAt),
      grades: t.grades.map((g) => ({
        graderId: g.graderId,
        type: g.type,
        score: g.score,
        passed: g.passed,
        gate: g.gate,
        reason: g.reason,
        evidence: Array.isArray(g.evidence) ? g.evidence.map(String) : [],
      })),
      manifest: (t.manifest?.json as Record<string, unknown> | undefined) ?? null,
    };
  }

  async events(id: string): Promise<unknown[]> {
    return parseJsonLines(await this.readStored(await this.trial(id), 'eventsPath'));
  }

  async session(id: string): Promise<unknown[]> {
    return parseJsonLines(await this.readStored(await this.trial(id), 'sessionPath'));
  }

  /** `/app` after the run vs. the fixtures the worker generated for this experiment's task. */
  async diff(id: string): Promise<string> {
    const trial = await this.trial(id);
    const fixtures = join(
      this.env.DATA_DIR,
      'harbor-tasks',
      trial.experimentId,
      trial.task.slug,
      'environment/fixtures',
    );
    return diffTrees(fixtures, this.workspace(trial));
  }

  async files(id: string): Promise<TrialFile[]> {
    return listFiles(this.workspace(await this.trial(id)));
  }

  /** Absolute path of one workspace file, safe to stream. */
  async file(id: string, path: string): Promise<string> {
    const root = this.workspace(await this.trial(id));
    try {
      const resolved = await resolveInside(root, path);
      if (!resolved) throw new NotFoundException(`File ${path} not found`);
      return resolved;
    } catch (error) {
      if (error instanceof UnsafePathError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private async trial(id: string) {
    const trial = await this.prisma.trial.findUnique({
      where: { id },
      include: { task: { select: { slug: true } } },
    });
    if (!trial) throw new NotFoundException(`Trial ${id} not found`);
    return trial;
  }

  private workspace(trial: Trial): string {
    if (!trial.workspacePath) throw new NotFoundException('This trial has no stored workspace');
    return join(this.env.DATA_DIR, trial.workspacePath);
  }

  private async readStored(trial: Trial, column: PathColumn): Promise<string> {
    const path = trial[column];
    if (!path) throw new NotFoundException(`This trial has no ${column.replace('Path', '')} file`);
    try {
      return await readFile(join(this.env.DATA_DIR, path), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException(`Stored file ${path} is missing`);
      }
      throw error;
    }
  }
}
