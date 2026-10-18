import { createHash } from 'node:crypto';
import { access, readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  agentConfigSchema,
  experimentSchema,
  factorViolation,
  taskSchema,
  type AgentConfig,
  type Experiment,
  type Task,
} from '@evals/shared';
import { isNode, LineCounter, parseDocument, type Document } from 'yaml';
import type { ZodType } from 'zod';

export class SyncError extends Error {
  constructor(readonly issues: string[]) {
    super(`Repository sync failed:\n${issues.join('\n')}`);
    this.name = 'SyncError';
  }
}

export interface Loaded<T> {
  file: string;
  hash: string;
  value: T;
}

export interface LoadedRepo {
  tasks: Loaded<Task>[];
  configs: Loaded<AgentConfig>[];
  experiments: Loaded<Experiment>[];
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function listDir(dir: string): Promise<{ name: string; isDirectory: boolean }[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .map((e) => ({ name: e.name, isDirectory: e.isDirectory() }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

function offsetOf(doc: Document, path: readonly PropertyKey[]): number | undefined {
  for (let depth = path.length; depth >= 0; depth--) {
    const node = doc.getIn(path.slice(0, depth), true);
    if (isNode(node) && node.range) return node.range[0];
  }
  return undefined;
}

async function parseFile<T>(
  repoDir: string,
  file: string,
  schema: ZodType<T>,
  issues: string[],
): Promise<Loaded<T> | undefined> {
  const text = await readFile(join(repoDir, file), 'utf8');
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: false });
  const at = (offset: number | undefined): string => {
    if (offset === undefined) return file;
    const { line, col } = lineCounter.linePos(offset);
    return `${file}:${line}:${col}`;
  };

  if (doc.errors.length > 0) {
    issues.push(...doc.errors.map((e) => `${at(e.pos[0])} ${e.message}`));
    return undefined;
  }
  const result = schema.safeParse(doc.toJS());
  if (!result.success) {
    issues.push(
      ...result.error.issues.map(
        (i) => `${at(offsetOf(doc, i.path))} ${i.path.join('.') || '(root)'}: ${i.message}`,
      ),
    );
    return undefined;
  }
  return { file, hash: createHash('sha256').update(text).digest('hex'), value: result.data };
}

async function parseDir<T>(
  repoDir: string,
  dir: string,
  schema: ZodType<T>,
  issues: string[],
): Promise<Loaded<T>[]> {
  const loaded: Loaded<T>[] = [];
  for (const entry of await listDir(join(repoDir, dir))) {
    if (entry.isDirectory || !entry.name.endsWith('.yaml')) continue;
    const item = await parseFile(repoDir, `${dir}/${entry.name}`, schema, issues);
    if (item) loaded.push(item);
  }
  return loaded;
}

function checkUniqueIds(items: Loaded<{ id: string }>[], issues: string[]): void {
  const seen = new Map<string, string>();
  for (const { file, value } of items) {
    const other = seen.get(value.id);
    if (other) issues.push(`${file}: id "${value.id}" is also defined in ${other}`);
    else seen.set(value.id, file);
  }
}

/** Reads and validates all tasks, configs and experiments; throws a `SyncError` listing every problem. */
export async function loadRepo(repoDir: string): Promise<LoadedRepo> {
  const issues: string[] = [];
  const repo: LoadedRepo = {
    tasks: [],
    configs: await parseDir(repoDir, 'configs', agentConfigSchema, issues),
    experiments: await parseDir(repoDir, 'experiments', experimentSchema, issues),
  };

  for (const entry of await listDir(join(repoDir, 'tasks'))) {
    if (!entry.isDirectory) continue;
    const file = `tasks/${entry.name}/task.yaml`;
    if (!(await exists(join(repoDir, file)))) {
      issues.push(`${file}: missing`);
      continue;
    }
    const task = await parseFile(repoDir, file, taskSchema, issues);
    if (task) repo.tasks.push(task);
  }
  if (issues.length > 0) throw new SyncError(issues);

  checkUniqueIds(repo.tasks, issues);
  checkUniqueIds(repo.configs, issues);
  checkUniqueIds(repo.experiments, issues);

  for (const { file, value: task } of repo.tasks) {
    if (file !== `tasks/${task.id}/task.yaml`) {
      issues.push(`${file}: id "${task.id}" must match its directory name`);
    }
    const fixturesDir = `${dirname(file)}/fixtures`;
    for (const fixture of task.fixtures) {
      if (!(await exists(join(repoDir, fixturesDir, fixture)))) {
        issues.push(`${file}: fixture "${fixture}" not found under ${fixturesDir}/`);
      }
    }
  }

  for (const { file, value: config } of repo.configs) {
    for (const skill of config.skills) {
      if (!(await exists(join(repoDir, 'skills', skill, 'SKILL.md')))) {
        issues.push(`${file}: skill "${skill}" not found at skills/${skill}/SKILL.md`);
      }
    }
    for (const memoryFile of config.memory.mode === 'seeded' ? config.memory.files : []) {
      if (!(await exists(join(repoDir, memoryFile)))) {
        issues.push(`${file}: memory file "${memoryFile}" not found`);
      }
    }
  }

  const taskIds = new Set(repo.tasks.map((t) => t.value.id));
  const configs = new Map(repo.configs.map((c) => [c.value.id, c.value]));
  for (const { file, value: experiment } of repo.experiments) {
    for (const id of experiment.taskIds.filter((id) => !taskIds.has(id))) {
      issues.push(`${file}: unknown task "${id}"`);
    }
    const baseline = configs.get(experiment.baselineConfigId);
    const candidate = configs.get(experiment.candidateConfigId);
    if (!baseline) issues.push(`${file}: unknown config "${experiment.baselineConfigId}"`);
    if (!candidate) issues.push(`${file}: unknown config "${experiment.candidateConfigId}"`);
    if (baseline && candidate) {
      const violation = factorViolation(experiment.factor, baseline, candidate);
      if (violation) issues.push(`${file}: ${violation}`);
    }
  }

  if (issues.length > 0) throw new SyncError(issues);
  return repo;
}
