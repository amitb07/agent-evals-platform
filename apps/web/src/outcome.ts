import type { GradeCheck, TrialDetail } from '@evals/shared';

export type Outcome = {
  tone: 'pass' | 'fail' | 'excluded' | 'pending';
  title: string;
  detail: string;
};

const cause = (c: string) => c.replaceAll('_', ' ');

/**
 * A command check's reason is only its exit code; the checker's own message is its last output
 * line, stored as evidence (`stderr: …` on failure, `stdout: …` on success). Prefer that message.
 */
export function checkReason(g: GradeCheck): string {
  if (g.type !== 'command' || !/^exit \S+$/.test(g.reason)) return g.reason;
  const prefer = g.passed ? 'stdout: ' : 'stderr: ';
  const block = g.evidence.find((e) => e.startsWith(prefer)) ?? g.evidence[0];
  const line = block
    ?.replace(/^(stdout|stderr): /, '')
    .trim()
    .split('\n')
    .at(-1)
    ?.trim();
  return line ? `${line} (${g.reason})` : g.reason;
}

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
    ? `Gate ${failedGate.graderId} failed: ${checkReason(failedGate)}`
    : failed
      ? `${failed.graderId}: ${checkReason(failed)}`
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
