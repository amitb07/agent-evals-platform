import type { Arm, FailureCause, TrialStatus } from '@evals/shared';
import { mean, sd } from './describe';

/** The trial fields the statistics read; a projection of the `Trial` row. */
export interface StatsTrial {
  taskSlug: string;
  arm: Arm;
  status: TrialStatus;
  rewardValid: boolean;
  score: number | null;
  gatePassed: boolean | null;
  failureCause: FailureCause | null;
  costUsd: number | null;
  durationMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
}

export const FLAKY_SD = 0.25;

export type ArmScores = Record<Arm, number[]>;

export const isFinished = (t: StatsTrial): boolean =>
  t.status !== 'pending' && t.status !== 'running';

/** Valid = finished with a valid reward and a score. Everything else finished is an exclusion. */
export const isValid = (t: StatsTrial): boolean =>
  isFinished(t) && t.rewardValid && t.score !== null;

export interface TaskScores {
  /** Task slug → valid scores per arm, in the order of `taskSlugs`. */
  scores: Map<string, ArmScores>;
  excluded: Record<Arm, number>;
}

/** Groups valid scores by task and arm; counts finished trials without a valid reward. */
export function taskScores(
  trials: readonly StatsTrial[],
  taskSlugs: readonly string[],
): TaskScores {
  const scores = new Map<string, ArmScores>(taskSlugs.map((slug) => [slug, { A: [], B: [] }]));
  const excluded: Record<Arm, number> = { A: 0, B: 0 };
  for (const t of trials) {
    if (!isFinished(t)) continue;
    const task = scores.get(t.taskSlug);
    if (!task) continue;
    if (isValid(t)) task[t.arm].push(t.score!);
    else excluded[t.arm]++;
  }
  return { scores, excluded };
}

export interface PairedDelta {
  taskSlug: string;
  meanA: number | null;
  meanB: number | null;
  /** `meanB − meanA`, null unless both arms have a valid trial. */
  delta: number | null;
  sdA: number | null;
  sdB: number | null;
  /** Repeats of the same config disagree a lot (SD above 0.25 in either arm). */
  flaky: boolean;
}

export function pairedDeltas(scores: ReadonlyMap<string, ArmScores>): PairedDelta[] {
  return [...scores].map(([taskSlug, { A, B }]) => {
    const meanA = mean(A);
    const meanB = mean(B);
    const sdA = sd(A);
    const sdB = sd(B);
    return {
      taskSlug,
      meanA,
      meanB,
      delta: meanA !== null && meanB !== null ? meanB - meanA : null,
      sdA,
      sdB,
      flaky: (sdA ?? 0) > FLAKY_SD || (sdB ?? 0) > FLAKY_SD,
    };
  });
}
