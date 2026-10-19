import type { Arm, ArmMetrics, FailureCause } from '@evals/shared';
import { mean } from './describe';
import { isFinished, isValid, type StatsTrial } from './scores';

export interface PassMetrics {
  /** Mean over tasks of the share of valid trials that pass. */
  passAt1: number | null;
  /** Share of tasks where at least one valid trial passes. */
  passAtK: number | null;
  /** Share of tasks where every valid trial passes. */
  passHatK: number | null;
}

/**
 * Pass metrics for one arm from valid scores per task. Tasks without a valid trial are skipped;
 * k is the number of valid trials a task has, so exclusions shrink it.
 */
export function passMetrics(scoresByTask: readonly number[][], threshold: number): PassMetrics {
  const tasks = scoresByTask.filter((s) => s.length > 0);
  const passes = tasks.map((s) => s.map((x) => x >= threshold));
  return {
    passAt1: mean(passes.map((p) => p.filter(Boolean).length / p.length)),
    passAtK: mean(passes.map((p) => (p.some(Boolean) ? 1 : 0))),
    passHatK: mean(passes.map((p) => (p.every(Boolean) ? 1 : 0))),
  };
}

export type CostMetrics = Omit<ArmMetrics, keyof PassMetrics>;

/** Counts, spend, latency and tokens for one arm. Cost includes excluded trials: they were paid for. */
export function costMetrics(
  trials: readonly StatsTrial[],
  arm: Arm,
  threshold: number,
): CostMetrics {
  const finished = trials.filter((t) => t.arm === arm && isFinished(t));
  const valid = finished.filter(isValid);
  const passes = valid.filter((t) => t.score! >= threshold).length;
  const failures: Partial<Record<FailureCause, number>> = {};
  for (const t of finished) {
    if (t.failureCause) failures[t.failureCause] = (failures[t.failureCause] ?? 0) + 1;
  }
  const costUsd = finished.reduce((sum, t) => sum + (t.costUsd ?? 0), 0);
  return {
    finished: finished.length,
    valid: valid.length,
    excluded: finished.length - valid.length,
    gateFailures: valid.filter((t) => t.gatePassed === false).length,
    failures,
    costUsd,
    costPerTrialUsd: finished.length > 0 ? costUsd / finished.length : null,
    costPerPassUsd: passes > 0 ? costUsd / passes : null,
    meanDurationMs: mean(finished.flatMap((t) => (t.durationMs === null ? [] : [t.durationMs]))),
    meanTokens: mean(
      finished.flatMap((t) =>
        t.tokensIn === null && t.tokensOut === null ? [] : [(t.tokensIn ?? 0) + (t.tokensOut ?? 0)],
      ),
    ),
  };
}
