import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { AgentConfig as ConfigRow, Experiment, Task as TaskRow } from '@evals/db';
import { JUDGE_PROMPT_HASH } from '@evals/grader';
import {
  agentConfigSchema,
  taskSchema,
  type AgentConfig,
  type Arm,
  type Task,
} from '@evals/shared';
import { compileHome, generateHarborTask, writeJobConfig } from './compile';
import type { WorkerEnv } from './env';

const run = promisify(execFile);

export function configFromRow(row: ConfigRow): AgentConfig {
  return agentConfigSchema.parse({
    id: row.slug,
    name: row.name,
    hermesImageDigest: row.hermesImageDigest,
    model: row.model,
    provider: row.provider,
    skills: row.skills,
    toolsets: row.toolsets,
    memory: row.memory,
    maxTurns: row.maxTurns,
  });
}

export function taskFromRow(row: TaskRow): Task {
  return taskSchema.parse({
    id: row.slug,
    title: row.title,
    category: row.category,
    prompt: row.prompt,
    fixtures: row.fixtures,
    timeoutSec: row.timeoutSec,
    tags: row.tags,
    graders: row.graders,
  });
}

export type ExperimentWithRelations = Experiment & {
  baselineConfig: ConfigRow;
  candidateConfig: ConfigRow;
  tasks: { task: TaskRow }[];
};

export interface PreparedJob {
  jobDir: string;
  jobName: string;
  jobConfigPath: string;
  /** Directory Harbor writes trial dirs into: `<jobDir>/<jobName>/`. */
  trialsDir: string;
  arms: Record<Arm, { configSlug: string; homeBundleHash: string }>;
  manifestBase: Record<string, unknown>;
}

async function imageId(image: string): Promise<string | null> {
  try {
    const { stdout } = await run('docker', ['image', 'inspect', '--format', '{{.Id}}', image]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function harborVersion(bin: string): Promise<string | null> {
  try {
    return (await run(bin, ['--version'])).stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Compiles both home bundles, generates the Harbor task dirs and `job.yaml`, and writes
 * `manifest-base.json`, the per-experiment part of every trial's run manifest.
 */
export async function prepareJob(
  experiment: ExperimentWithRelations,
  env: WorkerEnv,
): Promise<PreparedJob> {
  const jobDir = join(env.DATA_DIR, 'jobs', experiment.id);
  const datasetDir = join(env.DATA_DIR, 'harbor-tasks', experiment.id);
  await mkdir(jobDir, { recursive: true });

  const baseline = configFromRow(experiment.baselineConfig);
  const candidate = configFromRow(experiment.candidateConfig);
  const bundlesDir = join(env.DATA_DIR, 'bundles');
  const homeOpts = {
    repoDir: env.REPO_DIR,
    outDir: bundlesDir,
    customSkillsDir: join(env.DATA_DIR, 'skills'),
  };
  const homeA = await compileHome(baseline, homeOpts);
  const homeB = await compileHome(candidate, homeOpts);

  const taskHashes: Record<string, string> = {};
  for (const { task: row } of experiment.tasks) {
    const task = taskFromRow(row);
    const generated = await generateHarborTask(task, {
      repoDir: env.REPO_DIR,
      outDir: datasetDir,
      hermesImage: env.HERMES_IMAGE,
      verifierImage: env.VERIFIER_IMAGE,
      passThreshold: experiment.passThreshold,
    });
    taskHashes[task.id] = generated.hash;
  }

  const jobName = experiment.slug;
  const jobConfigPath = join(jobDir, 'job.yaml');
  await writeJobConfig(jobConfigPath, {
    jobName,
    datasetDir,
    repeats: experiment.repeats,
    concurrency: experiment.concurrency,
    retries: env.HARBOR_RETRIES,
    arms: [
      { arm: 'A', config: baseline, homeBundle: homeA.dir },
      { arm: 'B', config: candidate, homeBundle: homeB.dir },
    ],
    agentImportPath: env.HARBOR_AGENT_IMPORT_PATH,
  });

  const manifestBase = {
    experiment: {
      id: experiment.id,
      slug: experiment.slug,
      factor: experiment.factor,
      seed: experiment.seed,
    },
    platformGitSha: env.GIT_SHA ?? null,
    harborVersion: await harborVersion(env.HARBOR_BIN),
    agentImportPath: env.HARBOR_AGENT_IMPORT_PATH,
    images: {
      hermes: { ref: env.HERMES_IMAGE, id: await imageId(env.HERMES_IMAGE) },
      verifier: { ref: env.VERIFIER_IMAGE, id: await imageId(env.VERIFIER_IMAGE) },
    },
    configs: {
      A: {
        slug: baseline.id,
        yamlHash: experiment.baselineConfig.yamlHash,
        homeBundleHash: homeA.hash,
        hermesImageDigest: baseline.hermesImageDigest,
        model: baseline.model,
      },
      B: {
        slug: candidate.id,
        yamlHash: experiment.candidateConfig.yamlHash,
        homeBundleHash: homeB.hash,
        hermesImageDigest: candidate.hermesImageDigest,
        model: candidate.model,
      },
    },
    tasks: Object.fromEntries(
      experiment.tasks.map(({ task }) => [
        task.slug,
        { yamlHash: task.yamlHash, harborTaskHash: taskHashes[task.slug] },
      ]),
    ),
    judge: { model: env.JUDGE_MODEL, promptHash: JUDGE_PROMPT_HASH },
    passThreshold: experiment.passThreshold,
    repeats: experiment.repeats,
    concurrency: experiment.concurrency,
    harborRetries: env.HARBOR_RETRIES,
  };
  await writeFile(join(jobDir, 'manifest-base.json'), `${JSON.stringify(manifestBase, null, 2)}\n`);

  return {
    jobDir,
    jobName,
    jobConfigPath,
    trialsDir: join(jobDir, jobName),
    arms: {
      A: { configSlug: baseline.id, homeBundleHash: homeA.hash },
      B: { configSlug: candidate.id, homeBundleHash: homeB.hash },
    },
    manifestBase,
  };
}
