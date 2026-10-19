import type { Verdict } from '@evals/shared';
import { mean, quantile, sd } from './describe';
import { mulberry32, randomIndex } from './random';
import type { ArmScores } from './scores';

export interface ConfidenceInterval {
  effect: number;
  ciLow: number;
  ciHigh: number;
}

export const DEFAULT_ITERATIONS = 10_000;
const ALPHA = 0.05;

function percentileInterval(effect: number, draws: number[]): ConfidenceInterval {
  draws.sort((a, b) => a - b);
  return { effect, ciLow: quantile(draws, ALPHA / 2), ciHigh: quantile(draws, 1 - ALPHA / 2) };
}

/** Percentile bootstrap over tasks: resample the per-task deltas with replacement. */
export function bootstrapTasks(
  deltas: readonly number[],
  iterations = DEFAULT_ITERATIONS,
  seed = 0,
): ConfidenceInterval | null {
  const effect = mean(deltas);
  if (effect === null) return null;
  const rng = mulberry32(seed);
  const n = deltas.length;
  const draws = new Array<number>(iterations);
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += deltas[randomIndex(rng, n)]!;
    draws[i] = sum / n;
  }
  return percentileInterval(effect, draws);
}

function resampledMean(rng: () => number, xs: readonly number[]): number {
  let sum = 0;
  for (let j = 0; j < xs.length; j++) sum += xs[randomIndex(rng, xs.length)]!;
  return sum / xs.length;
}

/**
 * Two-stage bootstrap (sensitivity check): resample tasks, then each sampled task's repeats per arm.
 * Only tasks with valid trials in both arms take part. Wider than `bootstrapTasks` when repeats
 * disagree.
 */
export function bootstrapTwoStage(
  scores: readonly ArmScores[],
  iterations = DEFAULT_ITERATIONS,
  seed = 0,
): ConfidenceInterval | null {
  const paired = scores.filter((s) => s.A.length > 0 && s.B.length > 0);
  const effect = mean(paired.map((s) => mean(s.B)! - mean(s.A)!));
  if (effect === null) return null;
  const rng = mulberry32(seed);
  const n = paired.length;
  const draws = new Array<number>(iterations);
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      const task = paired[randomIndex(rng, n)]!;
      sum += resampledMean(rng, task.B) - resampledMean(rng, task.A);
    }
    draws[i] = sum / n;
  }
  return percentileInterval(effect, draws);
}

/**
 * Below this many paired tasks the verdict is always inconclusive: a percentile bootstrap puts the
 * whole CI above zero whenever every delta is positive, and "all n deltas share a sign" is only
 * significant at 5% (two-sided sign test, 2 / 2^n) from n = 6.
 */
export const MIN_TASKS_FOR_VERDICT = 6;

export function verdict(ci: ConfidenceInterval | null, nTasks: number): Verdict {
  if (!ci || nTasks < MIN_TASKS_FOR_VERDICT) return 'inconclusive';
  if (ci.ciLow > 0) return 'better';
  if (ci.ciHigh < 0) return 'worse';
  return 'inconclusive';
}

/** z(0.975) + z(0.80): two-sided 5% test with 80% power. */
const MDE_Z = 1.959964 + 0.841621;

/**
 * Retrospective minimum detectable effect: the true mean delta this design would detect 80% of the
 * time at 5% two-sided, using the observed spread of the deltas. Null below two tasks.
 */
export function mde(deltas: readonly number[]): number | null {
  const s = sd(deltas);
  return s === null ? null : (MDE_Z * s) / Math.sqrt(deltas.length);
}
