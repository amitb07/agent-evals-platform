#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import { graderSpecSchema, gradesSchema, type GraderSpec } from '@evals/shared';
import { grade, toReward } from './grade';
import { createJudge, type Judge } from './judge';

const USAGE = 'usage: grader --spec <grader.json> --workspace <dir> --out <dir>';

function judgeFromEnv(spec: GraderSpec, env: NodeJS.ProcessEnv): Judge | undefined {
  if (!spec.graders.some((g) => g.type === 'llm_judge')) return undefined;
  if (!env.JUDGE_MODEL) throw new Error('JUDGE_MODEL is required for llm_judge graders');
  if (!env.ANTHROPIC_API_KEY)
    throw new Error('ANTHROPIC_API_KEY is required for llm_judge graders');
  return createJudge(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }), env.JUDGE_MODEL);
}

/**
 * Exits 0 whenever the task was graded, pass or fail. Exits 1 only when grading itself failed; then
 * no `reward.json` is written, so Harbor records a verifier failure instead of a score.
 */
export async function main(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      spec: { type: 'string' },
      workspace: { type: 'string' },
      out: { type: 'string' },
    },
  });
  if (!values.spec || !values.workspace || !values.out) {
    console.error(USAGE);
    return 2;
  }
  await mkdir(values.out, { recursive: true });
  try {
    const spec = graderSpecSchema.parse(JSON.parse(await readFile(values.spec, 'utf8')));
    const grades = gradesSchema.parse(
      await grade(spec, { workspace: values.workspace, judge: judgeFromEnv(spec, env), env }),
    );
    await writeFile(join(values.out, 'grades.json'), `${JSON.stringify(grades, null, 2)}\n`);
    await writeFile(join(values.out, 'reward.json'), `${JSON.stringify(toReward(grades))}\n`);
    console.log(`score ${grades.score} gate ${grades.gatePassed} passed ${grades.passed}`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    await writeFile(join(values.out, 'grader-error.txt'), `${message}\n`);
    console.error(message);
    return 1;
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}
