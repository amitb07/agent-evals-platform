/**
 * Sensitivity analysis: recomputes an experiment's stats with some trial scores replaced, using the
 * same stats code and seed as the API. Nothing is written; the recorded result stays as it is.
 *
 * Usage: pnpm rescore <experimentId> [<trialId>=<score> ...]
 * Reads from the running API (API_URL, default http://localhost:3000).
 */
import type { ExperimentDetail, TrialSummary } from '@evals/shared';
import { computeStats } from '@evals/stats';

const API = `${process.env.API_URL ?? 'http://localhost:3000'}/api/v1`;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function main(): Promise<void> {
  const [experimentId, ...patches] = process.argv.slice(2);
  if (!experimentId) throw new Error('usage: rescore <experimentId> [<trialId>=<score> ...]');
  const scores = new Map(
    patches.map((p) => {
      const [id, score] = p.split('=');
      return [id!, Number(score)] as const;
    }),
  );
  const [experiment, trials] = await Promise.all([
    get<ExperimentDetail>(`/experiments/${experimentId}`),
    get<TrialSummary[]>(`/experiments/${experimentId}/trials`),
  ]);
  const unknown = [...scores.keys()].filter((id) => !trials.some((t) => t.id === id));
  if (unknown.length) throw new Error(`not trials of this experiment: ${unknown.join(', ')}`);

  const stats = computeStats({
    tasks: experiment.tasks.map((t) => ({
      slug: t.taskSlug,
      category: t.category,
      heldOut: experiment.heldOutTaskIds.includes(t.taskSlug),
    })),
    repeats: experiment.repeats,
    passThreshold: experiment.passThreshold,
    seed: experiment.seed,
    // Gate and token fields are not in the trial summary; they do not affect effect, CI or verdict.
    trials: trials.map((t) => ({
      ...t,
      score: scores.get(t.id) ?? t.score,
      gatePassed: null,
      tokensIn: null,
      tokensOut: null,
    })),
  });
  const { verdict, effect, ciLow, ciHigh, twoStage, mde, nTasks } = stats;
  console.log(
    JSON.stringify(
      {
        experiment: experiment.slug,
        replaced: scores.size,
        verdict,
        effect,
        ciLow,
        ciHigh,
        twoStage,
        mde,
        nTasks,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
