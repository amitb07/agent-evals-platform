import type { TrialDetail } from '@evals/shared';

export type Outcome = {
  tone: 'pass' | 'fail' | 'excluded' | 'pending';
  title: string;
  detail: string;
};

const cause = (c: string) => c.replaceAll('_', ' ');

/** One-line answer to "why did this run pass or fail", from the grades and failure cause. */
export function outcome(t: TrialDetail): Outcome {
  if (t.status === 'pending' || t.status === 'running') {
    return {
      tone: 'pending',
      title: t.status === 'pending' ? 'Not run yet' : 'Running',
      detail: '',
    };
  }
  if (!t.rewardValid) {
    return {
      tone: 'excluded',
      title: `Excluded: ${t.failureCause ? cause(t.failureCause) : t.status.replace('_', ' ')}`,
      detail: `${t.error ?? 'Infrastructure failure.'} Left out of the scores.`,
    };
  }
  if (t.passed) {
    return {
      tone: 'pass',
      title: 'Passed',
      detail: `Score ${t.score?.toFixed(2) ?? '—'}; every gate held.`,
    };
  }
  const failedGate = t.grades.find((g) => g.gate && !g.passed);
  const failed = [...t.grades].filter((g) => !g.passed).sort((a, b) => a.score - b.score)[0];
  const why = failedGate
    ? `Gate ${failedGate.graderId} failed: ${failedGate.reason}`
    : failed
      ? `${failed.graderId}: ${failed.reason}`
      : t.failureCause
        ? `The agent ${cause(t.failureCause).replace(/^agent /, '')}.`
        : 'Score below the pass threshold.';
  const ended =
    t.failureCause && (failedGate || failed) ? ` The run ended with ${cause(t.failureCause)}.` : '';
  return {
    tone: 'fail',
    title: `Failed · score ${t.score?.toFixed(2) ?? '—'}`,
    detail: why + ended,
  };
}
