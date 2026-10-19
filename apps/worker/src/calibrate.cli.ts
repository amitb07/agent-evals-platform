/**
 * Judge calibration (plan §12.8): grades each labelled case in `calibration/judge/` with the task's
 * real `llm_judge` grader, inside the verifier image the experiments use, `RUNS` times each.
 * Reports pass/fail agreement with the labels, mean absolute score error and judge consistency
 * across runs, and writes `calibration/judge/results.json`.
 *
 * Usage: pnpm calibrate   (needs ANTHROPIC_API_KEY in the environment or the repo's .env)
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { gradesSchema, taskSchema, type GraderSpec } from '@evals/shared';
import { parse } from 'yaml';

const run = promisify(execFile);
const repoDir = resolve(process.env.REPO_DIR ?? join(__dirname, '../../..'));
if (existsSync(join(repoDir, '.env'))) process.loadEnvFile(join(repoDir, '.env'));

const RUNS = Number(process.env.CALIBRATION_RUNS ?? 2);
const CONCURRENCY = 4;
const casesDir = join(repoDir, 'calibration/judge');

interface Case {
  id: string;
  task: string;
  file: string;
  source: 'agent' | 'crafted';
  label: { score: number; passed: boolean };
  why: string;
}

interface Verdict {
  score: number;
  passed: boolean;
  reason: string;
}

async function judgeOnce(c: Case, spec: GraderSpec): Promise<Verdict> {
  const dir = await mkdtemp(join(tmpdir(), 'calibrate-'));
  try {
    await mkdir(join(dir, 'app'));
    await copyFile(join(casesDir, c.id, c.file), join(dir, 'app', c.file));
    await writeFile(join(dir, 'grader.json'), JSON.stringify(spec));
    await run(
      'docker',
      [
        'run',
        '--rm',
        '-e',
        'ANTHROPIC_API_KEY',
        '-e',
        `JUDGE_MODEL=${process.env.JUDGE_MODEL ?? 'claude-opus-5'}`,
        '-v',
        `${dir}:/work`,
        process.env.VERIFIER_IMAGE ?? 'evals/verifier:latest',
        'node',
        '/grader/dist/cli.js',
        '--spec',
        '/work/grader.json',
        '--workspace',
        '/work/app',
        '--out',
        '/work/out',
      ],
      { env: process.env },
    );
    const grades = gradesSchema.parse(
      JSON.parse(await readFile(join(dir, 'out/grades.json'), 'utf8')),
    );
    const check = grades.checks[0]!;
    return { score: check.score, passed: check.score >= spec.passThreshold, reason: check.reason };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  const cases = JSON.parse(await readFile(join(casesDir, 'cases.json'), 'utf8')) as Case[];

  const specs = new Map<string, GraderSpec>();
  for (const slug of new Set(cases.map((c) => c.task))) {
    const task = taskSchema.parse(
      parse(await readFile(join(repoDir, 'tasks', slug, 'task.yaml'), 'utf8')),
    );
    const judge = task.graders.find((g) => g.type === 'llm_judge');
    if (!judge) throw new Error(`${slug} has no llm_judge grader`);
    specs.set(slug, { taskSlug: slug, passThreshold: 0.8, graders: [{ ...judge, weight: 1 }] });
  }

  const jobs = cases.flatMap((c) => Array.from({ length: RUNS }, () => c));
  const verdicts = new Map<string, Verdict[]>();
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < jobs.length) {
        const c = jobs[next++]!;
        const v = await judgeOnce(c, specs.get(c.task)!);
        verdicts.set(c.id, [...(verdicts.get(c.id) ?? []), v]);
        process.stdout.write('.');
      }
    }),
  );
  console.log('\n');

  const rows = cases.map((c) => {
    const vs = verdicts.get(c.id)!;
    return {
      ...c,
      judge: vs,
      agree: vs.filter((v) => v.passed === c.label.passed).length,
      absError: vs.reduce((s, v) => s + Math.abs(v.score - c.label.score), 0) / vs.length,
      consistent: vs.every((v) => v.passed === vs[0]!.passed),
    };
  });
  const total = rows.length * RUNS;
  const agree = rows.reduce((s, r) => s + r.agree, 0);
  const summary = {
    judgeModel: process.env.JUDGE_MODEL ?? 'claude-opus-5',
    runsPerCase: RUNS,
    cases: rows.length,
    passFailAgreement: agree / total,
    agreedVerdicts: `${agree}/${total}`,
    meanAbsScoreError: rows.reduce((s, r) => s + r.absError, 0) / rows.length,
    consistentCases: rows.filter((r) => r.consistent).length,
    computedAt: new Date().toISOString(),
  };
  await writeFile(
    join(casesDir, 'results.json'),
    `${JSON.stringify({ summary, rows }, null, 2)}\n`,
  );

  for (const r of rows) {
    const scores = r.judge.map((v) => v.score.toFixed(2)).join(' ');
    const mark = r.agree === RUNS ? '✓' : '✗';
    console.log(`${mark} ${r.id.padEnd(24)} label ${r.label.score.toFixed(2)} judge ${scores}`);
  }
  console.log('\n', summary);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
