import { describe, expect, it } from 'vitest';
import { costMetrics, passMetrics } from './metrics';
import { pairedDeltas, taskScores } from './scores';
import { trial } from './test-helpers';

describe('taskScores', () => {
  it('keeps valid scores, counts exclusions by arm and ignores unfinished trials', () => {
    const { scores, excluded } = taskScores(
      [
        trial('a', 'A', 1),
        trial('a', 'A', null, { status: 'failed', failureCause: 'sandbox_failed' }),
        trial('a', 'B', 0.5),
        trial('a', 'B', null, { status: 'ingest_failed' }),
        trial('a', 'B', null, { status: 'pending' }),
        trial('a', 'B', 0, { status: 'running' }),
        trial('b', 'B', 0, { status: 'failed', failureCause: 'agent_exhausted_budget' }),
        trial('other', 'A', 1),
      ],
      ['a', 'b'],
    );
    expect(scores.get('a')).toEqual({ A: [1], B: [0.5] });
    expect(scores.get('b')).toEqual({ A: [], B: [0] });
    expect(scores.has('other')).toBe(false);
    expect(excluded).toEqual({ A: 1, B: 1 });
  });
});

describe('pairedDeltas', () => {
  it('computes per-task means, SDs, deltas and the flaky flag', () => {
    const [a, b] = pairedDeltas(
      new Map([
        ['a', { A: [0, 1, 1], B: [1, 1, 1] }],
        ['b', { A: [0.5], B: [] }],
      ]),
    );
    expect(a).toMatchObject({ taskSlug: 'a', meanB: 1, sdB: 0, flaky: true });
    expect(a!.meanA).toBeCloseTo(2 / 3);
    expect(a!.delta).toBeCloseTo(1 / 3);
    expect(b).toEqual({
      taskSlug: 'b',
      meanA: 0.5,
      meanB: null,
      delta: null,
      sdA: null,
      sdB: null,
      flaky: false,
    });
  });
});

describe('passMetrics', () => {
  it('matches hand-computed pass@1, pass@k and pass^k', () => {
    const m = passMetrics([[1, 0, 1], [0, 0, 0], [0.9, 0.8, 0.85], []], 0.8);
    expect(m.passAt1).toBeCloseTo((2 / 3 + 0 + 1) / 3);
    expect(m.passAtK).toBeCloseTo(2 / 3);
    expect(m.passHatK).toBeCloseTo(1 / 3);
  });

  it('is null without valid trials', () => {
    expect(passMetrics([[], []], 0.8)).toEqual({ passAt1: null, passAtK: null, passHatK: null });
  });
});

describe('costMetrics', () => {
  it('charges excluded trials and divides spend by passes', () => {
    const trials = [
      trial('a', 'A', 1, { costUsd: 0.02, durationMs: 1000, tokensIn: 100, tokensOut: 20 }),
      trial('a', 'A', 0.5, {
        costUsd: 0.04,
        durationMs: 3000,
        gatePassed: false,
        tokensIn: 300,
        tokensOut: 40,
      }),
      trial('a', 'A', null, {
        status: 'failed',
        failureCause: 'model_provider_failed',
        costUsd: 0.03,
        durationMs: null,
        tokensIn: null,
        tokensOut: null,
      }),
      trial('a', 'A', null, { status: 'pending', costUsd: null }),
      trial('a', 'B', 1, { costUsd: 1 }),
    ];
    expect(costMetrics(trials, 'A', 0.8)).toEqual({
      finished: 3,
      valid: 2,
      excluded: 1,
      gateFailures: 1,
      failures: { model_provider_failed: 1 },
      costUsd: 0.09,
      costPerTrialUsd: 0.03,
      costPerPassUsd: 0.09,
      meanDurationMs: 2000,
      meanTokens: 230,
    });
  });

  it('has no cost per pass without passes and no averages without trials', () => {
    const m = costMetrics([trial('a', 'A', 0.1)], 'A', 0.8);
    expect(m.costPerPassUsd).toBeNull();
    expect(costMetrics([], 'B', 0.8)).toMatchObject({
      finished: 0,
      costUsd: 0,
      costPerTrialUsd: null,
      meanDurationMs: null,
      meanTokens: null,
    });
  });
});
