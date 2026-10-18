import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  classifyException,
  gradesSchema,
  harborTrialResultSchema,
  hermesTrialMetadataSchema,
  taskSlugFromHarborName,
  type Arm,
  type FailureCause,
  type Grades,
  type HarborTrialResult,
} from '@evals/shared';
import { exists } from '../compile/fs';

/**
 * Harbor's default `RetryConfig.exclude_exceptions` (Harbor 0.24 models/job/config.py). A failed
 * result with one of these is final; any other failure may still be retried, and Harbor then
 * deletes the trial dir and reruns it under the same name.
 */
export const HARBOR_NON_RETRIED_EXCEPTIONS: ReadonlySet<string> = new Set([
  'AgentTimeoutError',
  'VerifierTimeoutError',
  'RewardFileNotFoundError',
  'RewardFileEmptyError',
  'VerifierOutputParseError',
  'ApiUsageLimitError',
  'AgentSafetyRefusalError',
  'AgentAuthenticationError',
  'ModelNotFoundError',
]);

export interface TrialRecord {
  trialName: string;
  taskSlug: string;
  arm: Arm;
  result: HarborTrialResult;
  failureCause: FailureCause | null;
  rewardValid: boolean;
  grades: Grades | null;
  error: string | null;
  turnExitReason: string | null;
  exitCode: number | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  cacheRead: number | null;
  costUsd: number | null;
}

export type TrialDirState =
  { state: 'not_ready'; reason: string } | { state: 'ready'; record: TrialRecord };

const date = (s: string | null | undefined): Date | null => (s ? new Date(s) : null);

/**
 * Reads one Harbor trial dir. A trial is ready once `result.json` has `finished_at` and its outcome
 * is final: no exception, a non-retried exception, or Harbor has exited (`harborRunning=false`).
 * Throws when the files are present but malformed.
 */
export async function readTrialDir(dir: string, harborRunning: boolean): Promise<TrialDirState> {
  const resultPath = join(dir, 'result.json');
  if (!(await exists(resultPath))) return { state: 'not_ready', reason: 'no result.json' };
  const result = harborTrialResultSchema.parse(JSON.parse(await readFile(resultPath, 'utf8')));
  if (!result.finished_at) return { state: 'not_ready', reason: 'trial still running' };

  const exceptionType = result.exception_info?.exception_type ?? null;
  if (exceptionType && harborRunning && !HARBOR_NON_RETRIED_EXCEPTIONS.has(exceptionType)) {
    return { state: 'not_ready', reason: `${exceptionType} may still be retried` };
  }

  const taskSlug = taskSlugFromHarborName(result.task_name);
  if (!taskSlug) throw new Error(`Unexpected Harbor task name ${result.task_name}`);

  let { failureCause, rewardValid } = classifyException(exceptionType);
  let error = result.exception_info
    ? `${result.exception_info.exception_type}: ${result.exception_info.exception_message}`
    : null;

  const gradesPath = join(dir, 'verifier', 'grades.json');
  let grades: Grades | null = null;
  if (await exists(gradesPath)) {
    grades = gradesSchema.parse(JSON.parse(await readFile(gradesPath, 'utf8')));
  } else if (!exceptionType) {
    failureCause = 'verifier_failed';
    rewardValid = false;
    error = 'verifier finished without grades.json';
  }

  const agent = result.agent_result;
  const metadata = hermesTrialMetadataSchema.safeParse(agent?.metadata ?? {});
  const exitCode = metadata.success ? Number.parseInt(metadata.data.exit_code ?? '', 10) : NaN;
  const startedAt = date(result.started_at);
  const finishedAt = date(result.finished_at);

  return {
    state: 'ready',
    record: {
      trialName: result.trial_name,
      taskSlug,
      arm: result.config.agent.kwargs.arm,
      result,
      failureCause,
      rewardValid,
      grades,
      error,
      turnExitReason: metadata.success ? (metadata.data.end_reason ?? null) : null,
      exitCode: Number.isNaN(exitCode) ? null : exitCode,
      startedAt,
      finishedAt,
      durationMs: startedAt && finishedAt ? finishedAt.getTime() - startedAt.getTime() : null,
      tokensIn: agent?.n_input_tokens ?? null,
      tokensOut: agent?.n_output_tokens ?? null,
      cacheRead: agent?.n_cache_tokens ?? null,
      costUsd: agent?.cost_usd ?? null,
    },
  };
}
