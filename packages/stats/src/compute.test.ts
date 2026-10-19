import { experimentStatsSchema } from '@evals/shared';
import { describe, expect, it } from 'vitest';
import { MIN_TASKS_FOR_VERDICT } from './bootstrap';
import { computeStats } from './compute';
import { experiment, repeat, trial } from './test-helpers';

describe('computeStats', () => {
  it('finds no effect when both arms are equal', () => {
    const scores = repeat(12, (i) => [i / 12, i / 12, i / 12]);
    const stats = computeStats(experiment(scores, scores));
    expect(stats).toMatchObject({
      effect: 0,
      ciLow: 0,
      ciHigh: 0,
      verdict: 'inconclusive',
      mde: 0,
    });
    expect(stats.verdictNote).toBeNull();
  });

  it('calls B better when it gains 0.5 on every task', () => {
    const stats = computeStats(
      experiment(
        repeat(12, () => [0.2, 0.3, 0.4]),
        repeat(12, () => [0.7, 0.8, 0.9]),
      ),
    );
    expect(stats.verdict).toBe('better');
    expect(stats.effect).toBeCloseTo(0.5);
    expect(stats.ciLow).toBeCloseTo(0.5);
    expect(stats.twoStage.ciLow!).toBeGreaterThan(0);
    expect(stats.twoStage.ciLow!).toBeLessThan(0.5);
  });

  it('calls B worse when it loses on every task', () => {
    const stats = computeStats(
      experiment(
        repeat(8, () => [1, 1]),
        repeat(8, (i) => [0.5 + i / 100, 0.6]),
      ),
    );
    expect(stats.verdict).toBe('worse');
    expect(stats.ciHigh!).toBeLessThan(0);
  });

  it('is inconclusive when deltas cancel out', () => {
    const stats = computeStats(
      experiment(
        repeat(12, () => [0.5]),
        repeat(12, (i) => [i % 2 ? 1 : 0]),
      ),
    );
    expect(stats.effect).toBeCloseTo(0);
    expect(stats.ciLow!).toBeLessThan(0);
    expect(stats.ciHigh!).toBeGreaterThan(0);
    expect(stats.verdict).toBe('inconclusive');
  });

  it('withholds a direction below the minimum task count and says why', () => {
    const n = MIN_TASKS_FOR_VERDICT - 1;
    const stats = computeStats(
      experiment(
        repeat(n, () => [0]),
        repeat(n, () => [1]),
      ),
    );
    expect(stats.ciLow).toBe(1);
    expect(stats.verdict).toBe('inconclusive');
    expect(stats.verdictNote).toContain(`Only ${n} task(s)`);
  });

  it('is deterministic for a seed', () => {
    const input = experiment(
      repeat(12, (i) => [(i % 3) / 2, 0.5]),
      repeat(12, (i) => [(i % 4) / 3, 1]),
    );
    const a = computeStats({ ...input, now: new Date(0) });
    expect(computeStats({ ...input, now: new Date(0) })).toEqual(a);
    expect(computeStats({ ...input, seed: 43, now: new Date(0) }).ciLow).not.toBe(a.ciLow);
  });

  it('leaves out exclusions and unpaired tasks, and counts them', () => {
    const input = experiment([[1], [0], [0.5]], [[1], [1], [0.5]]);
    input.trials = [
      ...input.trials.filter((t) => !(t.taskSlug === 't2' && t.arm === 'B')),
      trial('t2', 'B', null, { status: 'failed', failureCause: 'sandbox_failed' }),
      trial('t0', 'A', null, { status: 'pending', costUsd: null }),
    ];
    input.tasks = input.tasks.map((t) => ({ ...t, heldOut: t.slug === 't1' }));
    const stats = computeStats(input);
    expect(stats.nTasks).toBe(2);
    expect(stats.effect).toBeCloseTo(0.5);
    expect(stats.tasks.map((t) => [t.taskSlug, t.nA, t.nB, t.delta, t.heldOut])).toEqual([
      ['t0', 1, 1, 0, false],
      ['t1', 1, 1, 1, true],
      ['t2', 1, 0, null, false],
    ]);
    expect(stats.tasks[2]!.costB).toBeNull();
    expect(stats.arms.A).toMatchObject({ finished: 3, excluded: 0 });
    expect(stats.arms.B).toMatchObject({
      finished: 3,
      valid: 2,
      excluded: 1,
      failures: { sandbox_failed: 1 },
    });
  });

  it('returns null intervals when nothing is paired yet', () => {
    const stats = computeStats({ ...experiment([[1]], [[1]]), trials: [] });
    expect(stats).toMatchObject({
      effect: null,
      ciLow: null,
      ciHigh: null,
      mde: null,
      nTasks: 0,
      verdict: 'inconclusive',
    });
    expect(stats.twoStage).toEqual({ effect: null, ciLow: null, ciHigh: null });
    expect(stats.arms.A.passAt1).toBeNull();
  });

  it('produces output that satisfies the shared API schema', () => {
    const stats = computeStats(
      experiment(
        repeat(6, () => [0, 1]),
        repeat(6, () => [1, 1]),
      ),
    );
    expect(() => experimentStatsSchema.parse(stats)).not.toThrow();
  });
});
