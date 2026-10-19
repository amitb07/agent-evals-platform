import type { TrialDetail } from '@evals/shared';
import { describe, expect, it } from 'vitest';
import { outcome } from './outcome';

const grade = (graderId: string, passed: boolean, gate = false, score = passed ? 1 : 0) => ({
  graderId,
  type: 'json' as const,
  score,
  passed,
  gate,
  reason: `${graderId} reason`,
  evidence: [],
});

const trial = (over: Partial<TrialDetail> = {}): TrialDetail => ({
  id: '00000000-0000-4000-8000-000000000001',
  taskId: '00000000-0000-4000-8000-000000000002',
  experimentId: '00000000-0000-4000-8000-000000000003',
  taskSlug: 'csv',
  configSlug: 'base',
  prompt: 'p',
  arm: 'A',
  repeatIndex: 0,
  attempt: 1,
  status: 'graded',
  failureCause: null,
  rewardValid: true,
  score: 1,
  passed: true,
  costUsd: 0.01,
  durationMs: 1000,
  startedAt: null,
  finishedAt: null,
  turnExitReason: 'cli_close',
  exitCode: 0,
  tokensIn: 1,
  tokensOut: 1,
  cacheRead: 0,
  gatePassed: true,
  error: null,
  grades: [],
  manifest: null,
  ...over,
});

describe('outcome', () => {
  it('passes', () => {
    expect(outcome(trial())).toMatchObject({ tone: 'pass', title: 'Passed' });
  });

  it('names the failed gate first', () => {
    const o = outcome(
      trial({
        passed: false,
        score: 0.2,
        grades: [grade('style', false), grade('totals', false, true)],
      }),
    );
    expect(o).toMatchObject({ tone: 'fail', title: 'Failed · score 0.20' });
    expect(o.detail).toBe('Gate totals failed: totals reason');
  });

  it('falls back to the weakest check, and adds the failure cause', () => {
    const o = outcome(
      trial({
        passed: false,
        score: 0.5,
        failureCause: 'agent_exhausted_budget',
        grades: [grade('a', false, false, 0.4), grade('b', false, false, 0.1)],
      }),
    );
    expect(o.detail).toBe('b: b reason The run ended with agent exhausted budget.');
  });

  it('explains excluded runs', () => {
    const o = outcome(
      trial({
        status: 'failed',
        rewardValid: false,
        passed: null,
        failureCause: 'sandbox_failed',
        error: 'Docker died.',
      }),
    );
    expect(o).toMatchObject({ tone: 'excluded', title: 'Excluded: sandbox failed' });
    expect(o.detail).toContain('Docker died.');
  });
});
