import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentConfigSchema, taskSchema, type AgentConfig, type Task } from '@evals/shared';
import { listFiles, writeTree } from '../fs';

const DIGEST = `sha256:${'a'.repeat(64)}`;

export const BASE_CONFIG: AgentConfig = agentConfigSchema.parse({
  id: 'base',
  name: 'Base',
  hermesImageDigest: DIGEST,
  model: 'claude-sonnet-5',
  provider: 'anthropic',
  toolsets: ['terminal', 'file'],
  memory: { mode: 'off' },
  maxTurns: 40,
});

export const SKILL_CONFIG: AgentConfig = {
  ...BASE_CONFIG,
  id: 'base-skill',
  skills: ['changelog-format'],
};

export const SEEDED_CONFIG: AgentConfig = {
  ...BASE_CONFIG,
  id: 'base-memory-seeded',
  memory: { mode: 'seeded', files: ['memory/seeded/MEMORY.md', 'memory/seeded/USER.md'] },
};

export const JUDGED_TASK: Task = taskSchema.parse({
  id: 'csv-summary',
  title: 'CSV summary',
  category: 'tools',
  prompt: 'Read data/sales.csv and write report.md with total revenue per region.',
  fixtures: ['data/sales.csv'],
  timeoutSec: 300,
  graders: [
    { type: 'file_exists', id: 'report-exists', path: 'report.md', weight: 0.2 },
    {
      type: 'command',
      id: 'totals-correct',
      run: 'node /tests/checks/check_report.js report.md',
      weight: 0.6,
      gate: true,
    },
    {
      type: 'llm_judge',
      id: 'clear-table',
      rubric: 'Is the report clear and formatted as a table?',
      files: ['report.md'],
      weight: 0.2,
    },
  ],
});

export const CODE_ONLY_TASK: Task = taskSchema.parse({
  id: 'hello',
  title: 'Hello',
  category: 'tools',
  prompt: 'Write hello.txt containing "Hello, Hermes!".\n',
  timeoutSec: 120,
  graders: [{ type: 'file_exists', id: 'hello-exists', path: 'hello.txt', weight: 1 }],
});

export const REPO_FILES = {
  'skills/changelog-format/SKILL.md': '# Changelog format\n\nUse Keep a Changelog headings.\n',
  'memory/seeded/MEMORY.md': 'The user wants reports in British English.\n',
  'memory/seeded/USER.md': 'Name: Sam\n',
  'tasks/csv-summary/task.yaml': 'id: csv-summary\n',
  'tasks/csv-summary/fixtures/data/sales.csv': 'region,revenue\nnorth,10\nsouth,5\n',
  'tasks/csv-summary/fixtures/unlisted.txt': 'not part of the task\n',
  'tasks/csv-summary/checks/check_report.js': 'process.exit(0);\n',
  'tasks/csv-summary/solution/solve.sh': '#!/bin/bash\necho "| north | 10 |" > /app/report.md\n',
  'tasks/hello/task.yaml': 'id: hello\n',
};

export async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `evals-${prefix}-`));
}

export async function writeRepo(): Promise<string> {
  const root = await tempDir('repo');
  await writeTree(root, REPO_FILES);
  return root;
}

/** Reads a directory into `{ path: content }` for snapshots. */
export async function readTree(root: string): Promise<Record<string, string>> {
  const tree: Record<string, string> = {};
  for (const file of await listFiles(root)) tree[file] = await readFile(join(root, file), 'utf8');
  return tree;
}
