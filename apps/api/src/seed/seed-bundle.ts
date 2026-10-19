import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { Prisma, PrismaService } from '@evals/db';
import { z } from 'zod';

/**
 * Demo seed (plan §14.1): finished experiments with their trials, grades, manifests and the trial
 * files the UI reads, in one gzipped JSON file. References to tasks and configs are slugs, so a
 * seed loads into any database whose YAML sync has the same tasks and configs.
 */
export const SEED_VERSION = 1;

const rowSchema = z.record(z.string(), z.unknown());

const seedTrialSchema = z.looseObject({
  id: z.uuid(),
  taskSlug: z.string(),
  configSlug: z.string(),
  grades: z.array(rowSchema),
  manifest: z.unknown().nullable(),
});

const seedExperimentSchema = z.looseObject({
  id: z.uuid(),
  slug: z.string(),
  baselineConfigSlug: z.string(),
  candidateConfigSlug: z.string(),
  taskSlugs: z.array(z.string()),
  trials: z.array(seedTrialSchema),
});

export const seedBundleSchema = z.object({
  version: z.literal(SEED_VERSION),
  exportedAt: z.string(),
  experiments: z.array(seedExperimentSchema),
  /** Path relative to DATA_DIR → content: text as is, binary files as `base64:<data>`. */
  files: z.record(z.string(), z.string()),
});
export type SeedBundle = z.infer<typeof seedBundleSchema>;

const BASE64 = 'base64:';

/** Text stays readable (and compresses well); anything with a NUL byte or invalid UTF-8 is base64. */
function encodeFile(bytes: Buffer): string {
  const text = bytes.toString('utf8');
  return bytes.includes(0) || !Buffer.from(text, 'utf8').equals(bytes) || text.startsWith(BASE64)
    ? BASE64 + bytes.toString('base64')
    : text;
}

const decodeFile = (content: string): Buffer =>
  content.startsWith(BASE64)
    ? Buffer.from(content.slice(BASE64.length), 'base64')
    : Buffer.from(content, 'utf8');

/** Values that must never be in a committed seed. */
const SECRET_PATTERN = /sk-ant-[A-Za-z0-9_-]{20,}/;

export class SeedError extends Error {}

async function walk(root: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

/** Experiment fields copied as they are; relations are replaced by slugs. */
const EXPERIMENT_FIELDS = [
  'id',
  'slug',
  'yamlHash',
  'name',
  'hypothesis',
  'factor',
  'repeats',
  'concurrency',
  'passThreshold',
  'costCapUsd',
  'seed',
  'heldOutTaskIds',
  'status',
  'stopRequested',
  'harborJobName',
  'error',
  'startedAt',
  'finishedAt',
  'createdAt',
] as const;

const TRIAL_FIELDS = [
  'id',
  'arm',
  'repeatIndex',
  'attempt',
  'harborTrialName',
  'status',
  'failureCause',
  'rewardValid',
  'turnExitReason',
  'exitCode',
  'startedAt',
  'finishedAt',
  'durationMs',
  'tokensIn',
  'tokensOut',
  'cacheRead',
  'costUsd',
  'score',
  'gatePassed',
  'passed',
  'eventsPath',
  'sessionPath',
  'workspacePath',
  'stderrPath',
  'error',
] as const;

const pick = <T extends object>(row: T, fields: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(fields.map((f) => [f, (row as Record<string, unknown>)[f]]));

/**
 * Builds the gzipped seed for the given experiments. Only finished experiments are accepted. Fails
 * if any row or file contains `secrets` or something shaped like an Anthropic key.
 */
export async function exportSeed(
  prisma: PrismaService,
  dataDir: string,
  experimentIds: string[],
  secrets: string[] = [],
): Promise<Buffer> {
  const experiments: SeedBundle['experiments'] = [];
  const files: Record<string, string> = {};

  const addFile = async (abs: string) => {
    files[relative(dataDir, abs).split(sep).join('/')] = encodeFile(await readFile(abs));
  };

  for (const id of experimentIds) {
    const e = await prisma.experiment.findUnique({
      where: { id },
      include: {
        baselineConfig: { select: { slug: true } },
        candidateConfig: { select: { slug: true } },
        tasks: { orderBy: { position: 'asc' }, include: { task: { select: { slug: true } } } },
        trials: {
          orderBy: [{ taskId: 'asc' }, { arm: 'asc' }, { repeatIndex: 'asc' }],
          include: {
            task: { select: { slug: true } },
            config: { select: { slug: true } },
            grades: { orderBy: { graderId: 'asc' } },
            manifest: true,
          },
        },
      },
    });
    if (!e) throw new SeedError(`Experiment ${id} not found`);
    if (!['completed', 'stopped_budget'].includes(e.status)) {
      throw new SeedError(
        `Experiment ${e.slug} is ${e.status}; only finished experiments are exported`,
      );
    }
    experiments.push({
      ...pick(e, EXPERIMENT_FIELDS),
      id: e.id,
      slug: e.slug,
      baselineConfigSlug: e.baselineConfig.slug,
      candidateConfigSlug: e.candidateConfig.slug,
      taskSlugs: e.tasks.map((t) => t.task.slug),
      trials: e.trials.map((t) => ({
        ...pick(t, TRIAL_FIELDS),
        id: t.id,
        taskSlug: t.task.slug,
        configSlug: t.config.slug,
        grades: t.grades.map((g) =>
          pick(g, ['graderId', 'type', 'score', 'passed', 'gate', 'reason', 'evidence']),
        ),
        manifest: t.manifest?.json ?? null,
      })),
    });

    for (const t of e.trials) {
      for (const path of [t.eventsPath, t.sessionPath, t.stderrPath]) {
        if (path) await addFile(join(dataDir, path)).catch(() => undefined);
      }
      if (t.workspacePath) {
        for (const f of await walk(join(dataDir, t.workspacePath))) await addFile(f);
      }
    }
    // The diff endpoint compares the workspace with these generated fixtures.
    for (const t of e.tasks) {
      const fixtures = join(dataDir, 'harbor-tasks', e.id, t.task.slug, 'environment/fixtures');
      for (const f of await walk(fixtures)) await addFile(f);
    }
  }

  const bundle: SeedBundle = {
    version: SEED_VERSION,
    exportedAt: new Date().toISOString(),
    experiments,
    files,
  };
  const json = JSON.stringify(bundle);
  const decoded = [json, ...Object.values(files).map((f) => decodeFile(f).toString('utf8'))];
  for (const text of decoded) {
    if (SECRET_PATTERN.test(text) || secrets.some((s) => s.length >= 8 && text.includes(s))) {
      throw new SeedError('Refusing to export: a row or file contains an API key');
    }
  }
  return gzipSync(json, { level: 9 });
}

export interface SeedLoadResult {
  loaded: string[];
  skipped: string[];
  files: number;
}

const date = (v: unknown) => (typeof v === 'string' ? new Date(v) : null);

/**
 * Loads a seed when the database has no trials yet. A draft experiment with the same slug (the
 * YAML sync creates one) is replaced; an experiment that already ran is left alone. Tasks and
 * configs must already exist (sync runs first). Existing files are never overwritten.
 */
export async function loadSeed(
  prisma: PrismaService,
  dataDir: string,
  gz: Buffer,
): Promise<SeedLoadResult | null> {
  if ((await prisma.trial.count()) > 0) return null;
  const bundle = seedBundleSchema.parse(JSON.parse(gunzipSync(gz).toString('utf8')));
  const result: SeedLoadResult = { loaded: [], skipped: [], files: 0 };

  const [tasks, configs] = await Promise.all([
    prisma.task.findMany({ select: { id: true, slug: true } }),
    prisma.agentConfig.findMany({ select: { id: true, slug: true } }),
  ]);
  const taskId = new Map(tasks.map((t) => [t.slug, t.id]));
  const configId = new Map(configs.map((c) => [c.slug, c.id]));

  for (const e of bundle.experiments) {
    const missing = [
      ...e.taskSlugs.filter((s) => !taskId.has(s)).map((s) => `task ${s}`),
      ...[e.baselineConfigSlug, e.candidateConfigSlug]
        .filter((s) => !configId.has(s))
        .map((s) => `config ${s}`),
    ];
    if (missing.length) {
      result.skipped.push(`${e.slug} (missing ${missing.join(', ')})`);
      continue;
    }
    const existing = await prisma.experiment.findFirst({
      where: { OR: [{ slug: e.slug }, { id: e.id }] },
      include: { _count: { select: { trials: true } } },
    });
    if (existing && (existing.status !== 'draft' || existing._count.trials > 0)) {
      result.skipped.push(`${e.slug} (already in the database)`);
      continue;
    }

    const row = e as Record<string, unknown>;
    await prisma.$transaction(async (tx) => {
      if (existing) await tx.experiment.delete({ where: { id: existing.id } });
      await tx.experiment.create({
        data: {
          ...(pick(row, EXPERIMENT_FIELDS) as Prisma.ExperimentUncheckedCreateInput),
          startedAt: date(row.startedAt),
          finishedAt: date(row.finishedAt),
          createdAt: date(row.createdAt) ?? undefined,
          baselineConfigId: configId.get(e.baselineConfigSlug)!,
          candidateConfigId: configId.get(e.candidateConfigSlug)!,
          tasks: {
            create: e.taskSlugs.map((slug, position) => ({ taskId: taskId.get(slug)!, position })),
          },
        },
      });
      for (const t of e.trials) {
        const trial = t as Record<string, unknown>;
        await tx.trial.create({
          data: {
            ...(pick(trial, TRIAL_FIELDS) as Prisma.TrialUncheckedCreateInput),
            startedAt: date(trial.startedAt),
            finishedAt: date(trial.finishedAt),
            experimentId: e.id,
            taskId: taskId.get(t.taskSlug)!,
            configId: configId.get(t.configSlug)!,
            grades: { create: t.grades as Prisma.GradeCreateWithoutTrialInput[] },
            ...(t.manifest
              ? { manifest: { create: { json: t.manifest as Prisma.InputJsonValue } } }
              : {}),
          },
        });
      }
    });
    result.loaded.push(e.slug);
  }

  if (result.loaded.length === 0) return result;
  for (const [path, content] of Object.entries(bundle.files)) {
    const abs = join(dataDir, path);
    if (relative(dataDir, abs).startsWith('..')) throw new SeedError(`Unsafe seed path ${path}`);
    if (await stat(abs).catch(() => null)) continue;
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, decodeFile(content));
    result.files++;
  }
  return result;
}
