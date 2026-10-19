import type { Arm } from '@evals/shared';
import type { StatsInput } from './compute';
import type { StatsTrial } from './scores';

export function trial(
  taskSlug: string,
  arm: Arm,
  score: number | null,
  over: Partial<StatsTrial> = {},
): StatsTrial {
  return {
    taskSlug,
    arm,
    status: 'graded',
    rewardValid: score !== null,
    score,
    gatePassed: score === null ? null : true,
    failureCause: null,
    costUsd: 0.01,
    durationMs: 1000,
    tokensIn: 100,
    tokensOut: 10,
    ...over,
  };
}

/** An experiment where task i scores `a[i]` in arm A and `b[i]` in arm B on every repeat. */
export function experiment(
  a: number[][],
  b: number[][],
  over: Partial<StatsInput> = {},
): StatsInput {
  const tasks = a.map((_, i) => ({ slug: `t${i}`, category: 'tools' as const, heldOut: false }));
  const trials = a.flatMap((scoresA, i) => [
    ...scoresA.map((s) => trial(`t${i}`, 'A', s)),
    ...b[i]!.map((s) => trial(`t${i}`, 'B', s)),
  ]);
  return {
    tasks,
    repeats: a[0]?.length ?? 1,
    passThreshold: 0.8,
    seed: 42,
    trials,
    iterations: 2000,
    ...over,
  };
}

export const repeat = <T>(n: number, f: (i: number) => T): T[] =>
  Array.from({ length: n }, (_, i) => f(i));
