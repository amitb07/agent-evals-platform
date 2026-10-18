import type { GradeCheck, Grader, GraderSpec, Grades, Reward } from '@evals/shared';
import { runCodeCheck } from './checks';
import { JUDGE_PROMPT_HASH, type Judge } from './judge';
import { readWorkspaceFile } from './workspace';

/** With a failed gate the task can score at most this, so prose cannot hide a wrong answer. */
export const GATE_FAILED_CAP = 0.2;

export interface GradeOptions {
  workspace: string;
  /** Required when the spec has an `llm_judge` grader and every gate passed. */
  judge?: Judge;
  env?: NodeJS.ProcessEnv;
}

const round = (x: number): number => Math.round(x * 1e6) / 1e6;

/** Runs code checks first, then the judge only if every gate passed; checks keep spec order. */
export async function grade(spec: GraderSpec, opts: GradeOptions): Promise<Grades> {
  const results = new Map<string, GradeCheck>();
  const record = (g: Grader, r: Omit<GradeCheck, 'graderId' | 'type' | 'gate'>): void => {
    results.set(g.id, {
      graderId: g.id,
      type: g.type,
      gate: g.type !== 'llm_judge' && g.gate,
      ...r,
    });
  };

  for (const g of spec.graders) {
    if (g.type !== 'llm_judge') record(g, await runCodeCheck(opts.workspace, g, opts.env));
  }
  const gatePassed = [...results.values()].every((c) => !c.gate || c.passed);

  let judgeUsed = false;
  for (const g of spec.graders) {
    if (g.type !== 'llm_judge') continue;
    if (!gatePassed) {
      record(g, { score: 0, passed: false, reason: 'skipped: a gate check failed', evidence: [] });
      continue;
    }
    if (!opts.judge) throw new Error(`Grader ${g.id} needs a judge but none is configured`);
    const files = await Promise.all(g.files.map((f) => readWorkspaceFile(opts.workspace, f)));
    const verdict = await opts.judge.judge(g.rubric, files);
    judgeUsed = true;
    record(g, {
      score: verdict.score,
      passed: verdict.passed,
      reason: verdict.unknown ? `unknown: ${verdict.reason}` : verdict.reason,
      evidence: verdict.evidence,
    });
  }

  const checks = spec.graders.map((g) => results.get(g.id)!);
  const weighted = spec.graders.reduce((sum, g) => sum + g.weight * results.get(g.id)!.score, 0);
  const score = round(gatePassed ? weighted : Math.min(weighted, GATE_FAILED_CAP));
  return {
    score,
    gatePassed,
    passed: gatePassed && score >= spec.passThreshold,
    checks,
    ...(judgeUsed && opts.judge
      ? { judge: { model: opts.judge.model, promptHash: JUDGE_PROMPT_HASH } }
      : {}),
  };
}

/** The flat numeric map Harbor reads from `reward.json`. */
export function toReward(grades: Grades): Reward {
  return {
    score: grades.score,
    gate_passed: grades.gatePassed ? 1 : 0,
    passed: grades.passed ? 1 : 0,
    ...Object.fromEntries(grades.checks.map((c) => [c.graderId, c.score])),
  };
}
