import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { exists } from '../compile/fs';

export const REDACTED = '[REDACTED]';

/** Replaces every occurrence of each secret in `bytes`. */
export function redact(bytes: Buffer, secrets: readonly string[]): Buffer {
  let out = bytes;
  for (const secret of secrets) {
    if (!secret) continue;
    const needle = Buffer.from(secret);
    if (out.indexOf(needle) === -1) continue;
    const parts: Buffer[] = [];
    let from = 0;
    for (let at = out.indexOf(needle); at !== -1; at = out.indexOf(needle, from)) {
      parts.push(out.subarray(from, at), Buffer.from(REDACTED));
      from = at + needle.length;
    }
    parts.push(out.subarray(from));
    out = Buffer.concat(parts);
  }
  return out;
}

/** Copies a file or directory tree with secrets redacted. Returns false when `from` is missing. */
export async function copyRedacted(
  from: string,
  to: string,
  secrets: readonly string[],
): Promise<boolean> {
  if (!(await exists(from))) return false;
  if (!(await stat(from)).isDirectory()) {
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, redact(await readFile(from), secrets));
    return true;
  }
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const src = join(entry.parentPath, entry.name);
    const dest = join(to, relative(from, src));
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, redact(await readFile(src), secrets));
  }
  return true;
}

/** Trial files kept under `<DATA_DIR>/trials/<trialId>/`, keyed by the Trial column they fill. */
export const TRIAL_FILES = {
  eventsPath: 'agent/events.jsonl',
  sessionPath: 'agent/session.jsonl',
  stderrPath: 'agent/stderr.txt',
  trajectoryPath: 'agent/trajectory.json',
  workspacePath: 'artifacts/app',
} as const;

const EXTRA_FILES = [
  'agent/arm.json',
  'agent/effective-config.yaml',
  'agent/home-writes.txt',
  'agent/instruction.md',
  'verifier/grades.json',
  'verifier/reward.json',
  'verifier/test-stdout.txt',
  'verifier/grader-error.txt',
  'result.json',
  'trial.log',
];

/**
 * Copies a Harbor trial dir's useful files into `destDir` with secrets redacted and returns the
 * Trial path columns, relative to `dataDir`, for the files that existed.
 */
export async function storeTrialFiles(
  trialDir: string,
  destDir: string,
  dataDir: string,
  secrets: readonly string[],
): Promise<Partial<Record<keyof typeof TRIAL_FILES, string>>> {
  const paths: Partial<Record<keyof typeof TRIAL_FILES, string>> = {};
  for (const [column, path] of Object.entries(TRIAL_FILES) as [
    keyof typeof TRIAL_FILES,
    string,
  ][]) {
    const dest = join(destDir, column === 'workspacePath' ? 'workspace' : path);
    if (await copyRedacted(join(trialDir, path), dest, secrets))
      paths[column] = relative(dataDir, dest);
  }
  for (const path of EXTRA_FILES)
    await copyRedacted(join(trialDir, path), join(destDir, path), secrets);
  return paths;
}
