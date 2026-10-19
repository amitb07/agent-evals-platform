import { describe, expect, it } from 'vitest';
import { mean, quantile, sd } from './describe';
import { mulberry32 } from './random';

describe('describe', () => {
  it('computes mean and sample SD', () => {
    expect(mean([])).toBeNull();
    expect(mean([1, 2, 3])).toBe(2);
    expect(sd([1])).toBeNull();
    expect(sd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 5);
  });

  it('interpolates quantiles like R type 7', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4], 0.025)).toBeCloseTo(1.075);
    expect(quantile([5], 0.975)).toBe(5);
  });
});

describe('mulberry32', () => {
  it('is deterministic for a seed and stays in [0, 1)', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mulberry32(8)()).not.toBe(xs[0]);
  });
});
