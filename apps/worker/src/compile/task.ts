import { chmod, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { harborTaskName, type GraderSpec, type Task } from '@evals/shared';
import { copy, exists, hashDir, writeTree } from './fs';
import { toToml, type TomlTable } from './toml';

export interface TaskGenOptions {
  repoDir: string;
  /** Parent directory; the task is written to `<outDir>/<taskSlug>/`. */
  outDir: string;
  /** Agent image (our Hermes runner image); fixtures are layered on top of it. */
  hermesImage: string;
  /** Verifier image containing the grader at `/grader`. */
  verifierImage: string;
  passThreshold: number;
}

export interface GeneratedTask {
  dir: string;
  hash: string;
}

const AGENT_HOSTS = ['api.anthropic.com'];

export function taskToml(task: Task): string {
  const usesJudge = task.graders.some((g) => g.type === 'llm_judge');
  const verifier: TomlTable = { environment_mode: 'separate', timeout_sec: 180 };
  // Harbor resolves `${VAR}` from the worker's environment at verify time (Harbor 0.24 verifier.py).
  if (usesJudge) {
    verifier.env = { ANTHROPIC_API_KEY: '${ANTHROPIC_API_KEY}', JUDGE_MODEL: '${JUDGE_MODEL}' };
  }
  return toToml({ schema_version: '1.3', artifacts: ['/app'] }, [
    ['task', { name: harborTaskName(task.id) }],
    ['metadata', { category: task.category }],
    ['environment', { cpus: 2, memory_mb: 2048, workdir: '/app', network_mode: 'no-network' }],
    [
      'agent',
      {
        timeout_sec: task.timeoutSec,
        user: 'hermes',
        network_mode: 'allowlist',
        allowed_hosts: AGENT_HOSTS,
      },
    ],
    ['verifier', verifier],
    [
      'verifier.environment',
      usesJudge
        ? { cpus: 1, memory_mb: 1024, network_mode: 'allowlist', allowed_hosts: AGENT_HOSTS }
        : { cpus: 1, memory_mb: 1024, network_mode: 'no-network' },
    ],
  ]);
}

/**
 * Writes one Harbor task directory. Graders and checks go only into `tests/`, which Harbor mounts in
 * the separate verifier container; the agent sees only `/app`. `grader.json` carries no config or
 * model names, so the judge is blind to the arm.
 */
export async function generateHarborTask(task: Task, opts: TaskGenOptions): Promise<GeneratedTask> {
  const src = join(opts.repoDir, 'tasks', task.id);
  const dir = join(opts.outDir, task.id);
  await rm(dir, { recursive: true, force: true });

  const spec: GraderSpec = {
    taskSlug: task.id,
    passThreshold: opts.passThreshold,
    graders: task.graders,
  };
  await writeTree(dir, {
    'instruction.md': task.prompt.endsWith('\n') ? task.prompt : `${task.prompt}\n`,
    'task.toml': taskToml(task),
    'environment/Dockerfile': [
      `FROM ${opts.hermesImage}`,
      'COPY --chown=10000:10000 fixtures/ /app/',
      '',
    ].join('\n'),
    'tests/Dockerfile': [`FROM ${opts.verifierImage}`, 'COPY . /tests/', ''].join('\n'),
    'tests/test.sh': [
      '#!/bin/bash',
      'set -euo pipefail',
      'mkdir -p /logs/verifier',
      'node /grader/dist/cli.js --spec /tests/grader.json --workspace /app --out /logs/verifier',
      '',
    ].join('\n'),
    'tests/grader.json': `${JSON.stringify(spec, null, 2)}\n`,
  });
  await chmod(join(dir, 'tests/test.sh'), 0o755);

  await mkdir(join(dir, 'environment/fixtures'), { recursive: true });
  for (const fixture of task.fixtures) {
    await copy(join(src, 'fixtures', fixture), join(dir, 'environment/fixtures', fixture));
  }
  if (await exists(join(src, 'checks'))) await copy(join(src, 'checks'), join(dir, 'tests/checks'));
  if (await exists(join(src, 'solution'))) await copy(join(src, 'solution'), join(dir, 'solution'));

  return { dir, hash: await hashDir(dir) };
}
