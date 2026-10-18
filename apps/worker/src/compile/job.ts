import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AgentConfig, Arm } from '@evals/shared';
import { stringify } from 'yaml';
import { hermesToolsets } from './home';

export const HERMES_AGENT_IMPORT_PATH = 'hermes_harbor.hermes_agent:HermesAgent';

export interface JobArm {
  arm: Arm;
  config: AgentConfig;
  /** Home bundle directory from `compileHome`. */
  homeBundle: string;
}

export interface JobOptions {
  jobName: string;
  /** Directory holding the generated Harbor task directories. */
  datasetDir: string;
  repeats: number;
  concurrency: number;
  retries: number;
  arms: [JobArm, JobArm];
  /** Harbor agent class; defaults to the Hermes adapter. */
  agentImportPath?: string;
}

/** Harbor JobConfig for one experiment: both arms in one job, so one scheduler interleaves them. */
export function jobConfig(opts: JobOptions): Record<string, unknown> {
  return {
    job_name: opts.jobName,
    n_attempts: opts.repeats,
    n_concurrent_trials: opts.concurrency,
    retry: { max_retries: opts.retries },
    environment: {
      type: 'docker',
      cpu_enforcement_policy: 'limit',
      memory_enforcement_policy: 'limit',
    },
    datasets: [{ path: opts.datasetDir }],
    // The adapter reads ANTHROPIC_API_KEY from the worker environment (ModelConnectionSpec).
    agents: opts.arms.map(({ arm, config, homeBundle }) => ({
      import_path: opts.agentImportPath ?? HERMES_AGENT_IMPORT_PATH,
      model_name: `${config.provider}/${config.model}`,
      kwargs: {
        arm,
        home_bundle: homeBundle,
        toolsets: hermesToolsets(config).join(','),
        skills: config.skills.join(','),
        max_turns: config.maxTurns,
      },
    })),
  };
}

/** Writes `job.yaml` for `harbor run -c <path>`. */
export async function writeJobConfig(path: string, opts: JobOptions): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, stringify(jobConfig(opts)));
}
