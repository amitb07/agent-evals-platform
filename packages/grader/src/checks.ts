import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import type { GradeCheck, Grader } from '@evals/shared';
import { readWorkspaceFile, resolveInWorkspace } from './workspace';

export type CodeGrader = Exclude<Grader, { type: 'llm_judge' }>;
export type CheckResult = Omit<GradeCheck, 'graderId' | 'type' | 'gate'>;

const DEFAULT_COMMAND_TIMEOUT_SEC = 60;
const MAX_EVIDENCE_CHARS = 2_000;

const pass = (reason: string, evidence: string[] = []): CheckResult => ({
  score: 1,
  passed: true,
  reason,
  evidence,
});
const fail = (reason: string, evidence: string[] = []): CheckResult => ({
  score: 0,
  passed: false,
  reason,
  evidence,
});
const tail = (s: string): string =>
  s.length > MAX_EVIDENCE_CHARS ? `…${s.slice(-MAX_EVIDENCE_CHARS)}` : s;

async function fileExists(workspace: string, path: string): Promise<CheckResult> {
  return (await resolveInWorkspace(workspace, path))
    ? pass(`${path} exists`)
    : fail(`${path} is missing`);
}

async function regex(
  workspace: string,
  g: Extract<CodeGrader, { type: 'regex' }>,
): Promise<CheckResult> {
  const file = await readWorkspaceFile(workspace, g.path);
  if (file.content === null) return fail(`${g.path} is missing`);
  const match = new RegExp(g.pattern, g.flags).exec(file.content);
  return match
    ? pass(`${g.path} matches /${g.pattern}/`, [tail(match[0])])
    : fail(`${g.path} does not match /${g.pattern}/`, file.truncated ? ['file truncated'] : []);
}

async function json(
  workspace: string,
  g: Extract<CodeGrader, { type: 'json' }>,
): Promise<CheckResult> {
  const resolved = await resolveInWorkspace(workspace, g.path);
  if (!resolved) return fail(`${g.path} is missing`);
  let actual: unknown;
  try {
    actual = JSON.parse(await readFile(resolved, 'utf8'));
  } catch (error) {
    return fail(`${g.path} is not valid JSON`, [String(error)]);
  }
  if (typeof actual !== 'object' || actual === null || Array.isArray(actual)) {
    return fail(`${g.path} is not a JSON object`);
  }
  const keys = Object.keys(g.expect);
  const wrong = keys.filter(
    (k) => !isDeepStrictEqual((actual as Record<string, unknown>)[k], g.expect[k]),
  );
  const evidence = wrong.map(
    (k) =>
      `${k}: expected ${JSON.stringify(g.expect[k])}, got ${JSON.stringify((actual as Record<string, unknown>)[k])}`,
  );
  const score = (keys.length - wrong.length) / keys.length;
  return {
    score,
    passed: wrong.length === 0,
    reason: `${keys.length - wrong.length}/${keys.length} keys match in ${g.path}`,
    evidence: evidence.map(tail),
  };
}

/** Runs `bash -lc <run>` in the workspace; exit 0 passes. The judge key is never passed to checks. */
export function command(
  workspace: string,
  g: Extract<CodeGrader, { type: 'command' }>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CheckResult> {
  const timeoutSec = g.timeoutSec ?? DEFAULT_COMMAND_TIMEOUT_SEC;
  const childEnv = { ...env };
  delete childEnv.ANTHROPIC_API_KEY;
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-lc', g.run], {
      cwd: workspace,
      env: childEnv,
      detached: true, // own process group, so a timeout kills grandchildren too
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout = tail(stdout + d.toString())));
    child.stderr.on('data', (d: Buffer) => (stderr = tail(stderr + d.toString())));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {
        // already exited
      }
    }, timeoutSec * 1000);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const evidence = [stdout && `stdout: ${stdout}`, stderr && `stderr: ${stderr}`].filter(
        Boolean,
      );
      if (timedOut) resolve(fail(`timed out after ${timeoutSec}s`, evidence));
      else if (code === 0) resolve(pass('exit 0', evidence));
      else resolve(fail(`exit ${code ?? signal}`, evidence));
    });
  });
}

export function runCodeCheck(
  workspace: string,
  g: CodeGrader,
  env?: NodeJS.ProcessEnv,
): Promise<CheckResult> {
  switch (g.type) {
    case 'file_exists':
      return fileExists(workspace, g.path);
    case 'regex':
      return regex(workspace, g);
    case 'json':
      return json(workspace, g);
    case 'command':
      return command(workspace, g, env);
  }
}
