import type { Grades } from '@evals/shared';
import { writeTree } from '../../compile/fs';
import base from './harbor-result.json';

export interface FakeTrial {
  name: string;
  taskSlug: string;
  arm: 'A' | 'B';
  exception?: string;
  grades?: Grades | null;
  costUsd?: number;
  finished?: boolean;
  files?: Record<string, string>;
}

export const passingGrades = (score = 1): Grades => ({
  score,
  gatePassed: true,
  passed: score >= 0.8,
  checks: [
    {
      graderId: 'hello',
      type: 'file_exists',
      score,
      passed: score === 1,
      gate: false,
      reason: 'ok',
      evidence: [],
    },
  ],
});

/** Writes a Harbor 0.24-shaped trial dir (from a real spike result.json) under `trialsDir`. */
export async function writeTrial(trialsDir: string, t: FakeTrial): Promise<void> {
  const result = {
    ...base,
    trial_name: t.name,
    task_name: `evals/${t.taskSlug}`,
    config: {
      ...base.config,
      agent: { ...base.config.agent, kwargs: { ...base.config.agent.kwargs, arm: t.arm } },
    },
    agent_result: { ...base.agent_result, cost_usd: t.costUsd ?? 0.01 },
    exception_info: t.exception
      ? {
          exception_type: t.exception,
          exception_message: 'boom',
          exception_traceback: '',
          occurred_at: base.finished_at,
        }
      : null,
    finished_at: t.finished === false ? null : base.finished_at,
  };
  const grades = t.grades === undefined ? passingGrades() : t.grades;
  await writeTree(`${trialsDir}/${t.name}`, {
    'result.json': JSON.stringify(result),
    'config.json': JSON.stringify(result.config),
    'agent/events.jsonl': '{"type":"text","text":"hi"}\n',
    'agent/stderr.txt': 'key=sk-test-secret\n',
    'artifacts/app/hello.txt': 'Hello, Hermes!\n',
    ...(grades ? { 'verifier/grades.json': JSON.stringify(grades) } : {}),
    ...t.files,
  });
}
