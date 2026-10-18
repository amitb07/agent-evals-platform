import { z } from 'zod';
import { armSchema, isoDateTimeSchema } from './common.schema';

const timingSchema = z.looseObject({
  started_at: isoDateTimeSchema.nullable(),
  finished_at: isoDateTimeSchema.nullable(),
});

/** `agent_result.metadata` as written by `hermes_harbor.hermes_agent`. */
export const hermesTrialMetadataSchema = z.looseObject({
  session_id: z.string().nullish(),
  hermes_exit_code: z.int().nullish(),
  exit_code: z.string().nullish(),
  end_reason: z.string().nullish(),
  api_call_count: z.int().nullish(),
  duration_ms: z.number().nullish(),
  cost_status: z.string().nullish(),
  cost_source: z.string().nullish(),
});

/** The subset of Harbor 0.24 `result.json` that ingestion reads. */
export const harborTrialResultSchema = z.looseObject({
  trial_name: z.string(),
  task_name: z.string(),
  config: z.looseObject({
    agent: z.looseObject({ kwargs: z.looseObject({ arm: armSchema }) }),
  }),
  agent_result: z
    .looseObject({
      n_input_tokens: z.int().nullable(),
      n_cache_tokens: z.int().nullable(),
      n_output_tokens: z.int().nullable(),
      cost_usd: z.number().nullable(),
      metadata: hermesTrialMetadataSchema.nullable(),
    })
    .nullable(),
  verifier_result: z
    .looseObject({ rewards: z.record(z.string(), z.number()).nullable() })
    .nullable(),
  exception_info: z
    .looseObject({
      exception_type: z.string(),
      exception_message: z.string(),
      occurred_at: isoDateTimeSchema,
    })
    .nullable(),
  started_at: isoDateTimeSchema.nullable(),
  finished_at: isoDateTimeSchema.nullable(),
  agent_execution: timingSchema.nullable(),
  verifier: timingSchema.nullable(),
});
export type HarborTrialResult = z.infer<typeof harborTrialResultSchema>;

export const failureCauseSchema = z.enum([
  'agent_exhausted_budget',
  'agent_refused_task',
  'sandbox_failed',
  'model_provider_failed',
  'verifier_failed',
  'harbor_failed',
  'cancelled',
  'unclassified',
]);
export type FailureCause = z.infer<typeof failureCauseSchema>;

// Copied from https://docs.harborframework.com/jobs/error-classification (Harbor 0.24).
const EXCEPTIONS_BY_CAUSE: Record<Exclude<FailureCause, 'unclassified'>, readonly string[]> = {
  agent_exhausted_budget: [
    'AgentTimeoutError',
    'ContextWindowExceededError',
    'OutputTokenExceededError',
    'ContextLengthExceededError',
    'OutputLengthExceededError',
  ],
  agent_refused_task: ['AgentSafetyRefusalError', 'ContentPolicyViolationError'],
  sandbox_failed: [
    'EnvironmentStartTimeoutError',
    'SandboxBuildFailedError',
    'AgentSetupTimeoutError',
    'HealthcheckError',
    'SandboxLikelyOutOfMemoryError',
    'MemoryLimitExceededError',
    'SSHAccessError',
    'GKEExecStreamClosedError',
    'GKEPodNotFoundError',
    'RuntimeRequestError',
    'AddTestsDirError',
    'DownloadVerifierDirError',
  ],
  model_provider_failed: [
    'ApiError',
    'ApiRateLimitError',
    'ApiInternalServerError',
    'ApiOverloadedError',
    'ApiConnectionClosedError',
    'ApiResponseStalledError',
    'UnknownApiError',
    'NetworkConnectionError',
    'ApiConnectionError',
    'ApiUsageLimitError',
    'RateLimitError',
    'InternalServerError',
    'ServiceUnavailableError',
    'APIConnectionError',
    'APIError',
    'Timeout',
    'BadRequestError',
    'UnprocessableEntityError',
    'UnsupportedParamsError',
    'APIResponseValidationError',
    'BudgetExceededError',
    'AgentAuthenticationError',
    'ModelNotFoundError',
    'ApiProviderResourceNotFoundError',
    'AuthenticationError',
    'PermissionDeniedError',
    'NotFoundError',
  ],
  verifier_failed: [
    'VerifierTimeoutError',
    'RewardFileNotFoundError',
    'RewardFileEmptyError',
    'VerifierOutputParseError',
  ],
  harbor_failed: [
    'ServiceOperationsUnsupportedError',
    'VercelScopeError',
    'DspyImportError',
    'MissingExtraError',
    'RegradeError',
  ],
  cancelled: ['CancelledError'],
};

export const FAILURE_CAUSE_BY_EXCEPTION: ReadonlyMap<string, FailureCause> = new Map(
  Object.entries(EXCEPTIONS_BY_CAUSE).flatMap(([cause, types]) =>
    types.map((type) => [type, cause as FailureCause] as const),
  ),
);

const REWARD_VALID_CAUSES: ReadonlySet<FailureCause> = new Set([
  'agent_exhausted_budget',
  'agent_refused_task',
]);

/** A trial without an exception has a valid reward; unknown exception types are `unclassified`. */
export function classifyException(exceptionType: string | null | undefined): {
  failureCause: FailureCause | null;
  rewardValid: boolean;
} {
  if (!exceptionType) return { failureCause: null, rewardValid: true };
  const failureCause = FAILURE_CAUSE_BY_EXCEPTION.get(exceptionType) ?? 'unclassified';
  return { failureCause, rewardValid: REWARD_VALID_CAUSES.has(failureCause) };
}
