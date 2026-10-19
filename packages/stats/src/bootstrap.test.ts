import { describe, expect, it } from 'vitest';
import {
  bootstrapTasks,
  bootstrapTwoStage,
  mde,
  MIN_TASKS_FOR_VERDICT,
  verdict,
} from './bootstrap';
import { sd } from './describe';

const noisy = [0.4, -0.1, 0.3, 0.0, 0.6, 0.2, -0.2, 0.5, 0.1, 0.3, 0.0, 0.4];

describe('bootstrapTasks', () => {
  it('returns null without deltas', () => {
    expect(bootstrapTasks([])).toBeNull();
  });

  it('collapses to the effect when every delta is equal', () => {
    expect(bootstrapTasks(Array(12).fill(0.5), 1000, 1)).toEqual({
      effect: 0.5,
      ciLow: 0.5,
      ciHigh: 0.5,
    });
  });

  it('is deterministic for a seed', () => {
    expect(bootstrapTasks(noisy, 5000, 3)).toEqual(bootstrapTasks(noisy, 5000, 3));
    expect(bootstrapTasks(noisy, 5000, 3)).not.toEqual(bootstrapTasks(noisy, 5000, 4));
  });

  it('matches the normal-approximation interval on a symmetric sample', () => {
    const ci = bootstrapTasks(noisy, 20_000, 1)!;
    const n = noisy.length;
    // The bootstrap SE of a mean is the plug-in SD (divisor n) over sqrt(n).
    const se = (sd(noisy)! * Math.sqrt((n - 1) / n)) / Math.sqrt(n);
    expect(ci.effect).toBeCloseTo(0.2083, 4);
    expect(ci.ciLow).toBeCloseTo(ci.effect - 1.96 * se, 1);
    expect(ci.ciHigh).toBeCloseTo(ci.effect + 1.96 * se, 1);
    expect(Math.abs(ci.ciHigh - ci.ciLow - 2 * 1.96 * se)).toBeLessThan(0.03);
  });
});

describe('bootstrapTwoStage', () => {
  it('only uses tasks with both arms', () => {
    const ci = bootstrapTwoStage(
      [
        { A: [0], B: [1] },
        { A: [], B: [0] },
      ],
      100,
      1,
    );
    expect(ci).toEqual({ effect: 1, ciLow: 1, ciHigh: 1 });
    expect(bootstrapTwoStage([{ A: [], B: [1] }])).toBeNull();
  });

  it('is wider than the task bootstrap when repeats disagree', () => {
    const scores = Array.from({ length: 12 }, (_, i) => ({
      A: [0, 1, 0.5],
      B: i % 2 ? [1, 0, 1] : [0.5, 1, 0],
    }));
    const deltas = scores.map((s) => s.B.reduce((a, b) => a + b) / 3 - 0.5);
    const one = bootstrapTasks(deltas, 5000, 9)!;
    const two = bootstrapTwoStage(scores, 5000, 9)!;
    expect(two.effect).toBeCloseTo(one.effect, 10);
    expect(two.ciHigh - two.ciLow).toBeGreaterThan(one.ciHigh - one.ciLow);
  });
});

describe('verdict', () => {
  const ci = (ciLow: number, ciHigh: number) => ({ effect: (ciLow + ciHigh) / 2, ciLow, ciHigh });

  it('reads the CI against zero', () => {
    expect(verdict(ci(0.1, 0.3), 12)).toBe('better');
    expect(verdict(ci(-0.3, -0.1), 12)).toBe('worse');
    expect(verdict(ci(-0.1, 0.3), 12)).toBe('inconclusive');
    expect(verdict(ci(0, 0.3), 12)).toBe('inconclusive');
    expect(verdict(null, 12)).toBe('inconclusive');
  });

  it('is inconclusive below the minimum task count', () => {
    expect(verdict(ci(0.4, 0.6), MIN_TASKS_FOR_VERDICT - 1)).toBe('inconclusive');
    expect(verdict(ci(0.4, 0.6), MIN_TASKS_FOR_VERDICT)).toBe('better');
  });
});

describe('mde', () => {
  it('uses 95% confidence and 80% power', () => {
    expect(mde([0.5])).toBeNull();
    expect(mde([0, 1])).toBeCloseTo((2.801585 * Math.SQRT1_2) / Math.SQRT2, 5);
    expect(mde(Array(12).fill(0.2))).toBeCloseTo(0, 12);
  });
});
