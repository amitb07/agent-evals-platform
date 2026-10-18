import { describe, expect, it } from 'vitest';
import result from './__fixtures__/harbor-result.json';
import { classifyException, harborTrialResultSchema } from './harbor.schema';

describe('harborTrialResultSchema', () => {
  it('parses a real Harbor 0.24 result', () => {
    const parsed = harborTrialResultSchema.parse(result);
    expect(parsed.config.agent.kwargs.arm).toBe('B');
    expect(parsed.verifier_result?.rewards).toEqual({ reward: 1 });
    expect(parsed.agent_result?.metadata?.end_reason).toBe('cli_close');
  });

  it('parses a failed trial', () => {
    const failed = {
      ...result,
      agent_result: null,
      verifier_result: null,
      exception_info: {
        exception_type: 'AgentTimeoutError',
        exception_message: 'timed out',
        exception_traceback: '',
        occurred_at: '2026-10-18T17:27:06.736940Z',
      },
    };
    expect(harborTrialResultSchema.parse(failed).exception_info?.exception_type).toBe(
      'AgentTimeoutError',
    );
  });

  it('rejects a result without an arm', () => {
    const config = { agent: { kwargs: {} } };
    expect(harborTrialResultSchema.safeParse({ ...result, config }).success).toBe(false);
  });
});

describe('classifyException', () => {
  it.each([
    [null, null, true],
    ['AgentTimeoutError', 'agent_exhausted_budget', true],
    ['AgentSafetyRefusalError', 'agent_refused_task', true],
    ['ApiRateLimitError', 'model_provider_failed', false],
    ['SandboxBuildFailedError', 'sandbox_failed', false],
    ['RewardFileNotFoundError', 'verifier_failed', false],
    ['NonZeroAgentExitCodeError', 'unclassified', false],
    ['SomethingNewError', 'unclassified', false],
  ])('%s -> %s (rewardValid %s)', (type, failureCause, rewardValid) => {
    expect(classifyException(type)).toEqual({ failureCause, rewardValid });
  });
});
