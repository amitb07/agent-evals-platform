/**
 * Oracle run (plan §12.7): generates Harbor task dirs from `tasks/<slug>/task.yaml` exactly as an
 * experiment would, runs Harbor's `oracle` agent (each task's `solution/solve.sh`) and grades the
 * result with the real verifier. Every task must score 1.0.
 *
 * Usage: pnpm oracle [task-slug ...]   (default: every task in tasks/)
 * Reads ANTHROPIC_API_KEY and JUDGE_MODEL from the environment or the repo's .env (judged tasks).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { taskSchema, taskSlugFromHarborName } from '@evals/shared';
import { parse } from 'yaml';
import { generateHarborTask } from './compile';

const repoDir = resolve(process.env.REPO_DIR ?? join(__dirname, '../../..'));
if (existsSync(join(repoDir, '.env'))) process.loadEnvFile(join(repoDir, '.env'));

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const slugs = requested.length
    ? requested
    : (await readdir(join(repoDir, 'tasks'), { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();

  const outDir = join(
    resolve(process.env.DATA_DIR ?? join(repoDir, 'data')),
    'oracle',
    new Date().toISOString().replace(/[:.]/g, '-'),
  );
  const tasksDir = join(outDir, 'tasks');
  for (const slug of slugs) {
    const file = join(repoDir, 'tasks', slug, 'task.yaml');
    const task = taskSchema.parse(parse(await readFile(file, 'utf8')));
    await generateHarborTask(task, {
      repoDir,
      outDir: tasksDir,
      hermesImage: process.env.HERMES_IMAGE ?? 'evals/hermes-runner:latest',
      verifierImage: process.env.VERIFIER_IMAGE ?? 'evals/verifier:latest',
      passThreshold: 0.8,
    });
  }

  const jobName = 'oracle';
  const args = ['run', '-y', '-p', tasksDir, '-a', 'oracle', '-o', join(outDir, 'jobs')];
  args.push('--job-name', jobName, '-n', process.env.HARBOR_CONCURRENCY ?? '4');
  console.log(`harbor ${args.join(' ')}`);
  const code = await new Promise<number | null>((done, fail) => {
    const child = spawn(process.env.HARBOR_BIN ?? 'harbor', args, {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, JUDGE_MODEL: process.env.JUDGE_MODEL ?? 'claude-opus-5' },
    });
    child.on('error', fail);
    child.on('exit', done);
  });

  const trialsDir = join(outDir, 'jobs', jobName);
  const scores = new Map<string, string>();
  for (const entry of await readdir(trialsDir, { withFileTypes: true })) {
    const resultFile = join(trialsDir, entry.name, 'result.json');
    if (!entry.isDirectory() || !existsSync(resultFile)) continue;
    const result = JSON.parse(await readFile(resultFile, 'utf8')) as {
      task_name: string;
      verifier_result?: { rewards?: Record<string, number> | null } | null;
      exception_info?: { exception_type: string } | null;
    };
    const slug = taskSlugFromHarborName(result.task_name) ?? result.task_name;
    const score = result.verifier_result?.rewards?.score;
    scores.set(
      slug,
      score === undefined ? `error: ${result.exception_info?.exception_type}` : score.toFixed(2),
    );
  }

  console.log('\nOracle scores');
  let ok = code === 0;
  for (const slug of slugs) {
    const score = scores.get(slug) ?? 'missing';
    if (score !== '1.00') ok = false;
    console.log(`  ${score === '1.00' ? '✓' : '✗'} ${slug.padEnd(28)} ${score}`);
  }
  console.log(`\nJob dir: ${trialsDir}`);
  process.exit(ok ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
