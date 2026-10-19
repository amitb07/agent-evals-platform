import type { Arm, ArmMetrics, ExperimentStats, TaskCategory } from '@evals/shared';
import { mean } from './describe';
import {
  bootstrapTasks,
  bootstrapTwoStage,
  DEFAULT_ITERATIONS,
  MIN_TASKS_FOR_VERDICT,
  mde,
  verdict,
  type ConfidenceInterval,
} from './bootstrap';
import { costMetrics, passMetrics } from './metrics';
import { isValid, pairedDeltas, taskScores, type StatsTrial } from './scores';

export interface StatsInput {
  /** The experiment's tasks in display order. */
  tasks: readonly { slug: string; category: TaskCategory; heldOut: boolean }[];
  repeats: number;
  passThreshold: number;
  seed: number;
  trials: readonly StatsTrial[];
  iterations?: number;
  now?: Date;
}

const NO_CI = { effect: null, ciLow: null, ciHigh: null };
const orNull = (ci: ConfidenceInterval | null) => ci ?? NO_CI;

/** Everything the Compare screen shows, from the experiment's trial rows. Pure and deterministic. */
export function computeStats(input: StatsInput): ExperimentStats {
  const iterations = input.iterations ?? DEFAULT_ITERATIONS;
  const slugs = input.tasks.map((t) => t.slug);
  const { scores } = taskScores(input.trials, slugs);
  const deltas = pairedDeltas(scores);
  const paired = deltas.flatMap((d) => (d.delta === null ? [] : [d.delta]));

  const ci = bootstrapTasks(paired, iterations, input.seed);
  const twoStage = bootstrapTwoStage([...scores.values()], iterations, input.seed);

  const meanCost = (slug: string, arm: Arm) =>
    mean(
      input.trials.flatMap((t) =>
        t.taskSlug === slug && t.arm === arm && isValid(t) && t.costUsd !== null ? [t.costUsd] : [],
      ),
    );

  const arm = (a: Arm): ArmMetrics => ({
    ...costMetrics(input.trials, a, input.passThreshold),
    ...passMetrics(
      [...scores.values()].map((s) => s[a]),
      input.passThreshold,
    ),
  });

  return {
    ...orNull(ci),
    verdict: verdict(ci, paired.length),
    verdictNote:
      paired.length < MIN_TASKS_FOR_VERDICT
        ? `Only ${paired.length} task(s) have valid trials in both arms; at least ${MIN_TASKS_FOR_VERDICT} are needed for a Better/Worse verdict.`
        : null,
    twoStage: orNull(twoStage),
    mde: mde(paired),
    nTasks: paired.length,
    k: input.repeats,
    passThreshold: input.passThreshold,
    iterations,
    seed: input.seed,
    tasks: input.tasks.map((task, i) => {
      const d = deltas[i]!;
      const s = scores.get(task.slug)!;
      return {
        taskSlug: task.slug,
        category: task.category,
        heldOut: task.heldOut,
        nA: s.A.length,
        nB: s.B.length,
        meanA: d.meanA,
        meanB: d.meanB,
        delta: d.delta,
        sdA: d.sdA,
        sdB: d.sdB,
        flaky: d.flaky,
        costA: meanCost(task.slug, 'A'),
        costB: meanCost(task.slug, 'B'),
      };
    }),
    arms: { A: arm('A'), B: arm('B') },
    computedAt: (input.now ?? new Date()).toISOString(),
  };
}
