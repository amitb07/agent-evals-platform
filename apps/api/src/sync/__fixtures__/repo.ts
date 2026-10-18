import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const DIGEST = `sha256:${'a'.repeat(64)}`;

export const TASK_YAML = `id: csv-summary
title: CSV summary
category: tools
prompt: Summarise data/sales.csv into report.md.
fixtures: [data/sales.csv]
timeoutSec: 300
graders:
  - type: file_exists
    id: report-exists
    path: report.md
    weight: 1
`;

const config = (id: string, skills: string): string => `id: ${id}
name: ${id}
hermesImageDigest: "${DIGEST}"
model: claude-sonnet-5
provider: anthropic
skills: ${skills}
toolsets: [terminal, file]
memory: { mode: off }
maxTurns: 40
`;

export const EXPERIMENT_YAML = `id: e1-skills
name: E1 skills
hypothesis: The skill helps.
factor: skills
taskIds: [csv-summary]
baselineConfigId: base
candidateConfigId: base-skill
repeats: 3
costCapUsd: 15
seed: 1
`;

export const VALID_REPO: Record<string, string> = {
  'tasks/csv-summary/task.yaml': TASK_YAML,
  'tasks/csv-summary/fixtures/data/sales.csv': 'region,revenue\n',
  'configs/base.yaml': config('base', '[]'),
  'configs/base-skill.yaml': config('base-skill', '[changelog-format]'),
  'skills/changelog-format/SKILL.md': '# Changelog format\n',
  'experiments/e1-skills.yaml': EXPERIMENT_YAML,
};

export async function writeRepo(files: Record<string, string>, dir?: string): Promise<string> {
  const root = dir ?? (await mkdtemp(join(tmpdir(), 'evals-repo-')));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}
