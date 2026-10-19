import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { createTwoFilesPatch } from 'diff';

/** Files larger than this, or containing a NUL byte, are summarised instead of diffed. */
export const MAX_DIFF_BYTES = 256 * 1024;

export class UnsafePathError extends Error {}

/**
 * Resolves a client-supplied relative path inside `root`. Rejects absolute paths, `..` segments and
 * symlinks that resolve outside `root`. Returns null when the file does not exist.
 */
export async function resolveInside(root: string, path: string): Promise<string | null> {
  if (!path || isAbsolute(path) || path.split(/[\\/]/).includes('..') || path.includes('\0')) {
    throw new UnsafePathError(`Unsafe path: ${path}`);
  }
  let real: string;
  let realRoot: string;
  try {
    [realRoot, real] = await Promise.all([realpath(root), realpath(join(root, path))]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  if (real !== realRoot && !real.startsWith(realRoot + sep)) {
    throw new UnsafePathError(`Path leaves the workspace: ${path}`);
  }
  return real;
}

/** Regular files under `root` (symlinks are skipped), relative, sorted. Missing root → []. */
export async function listFiles(root: string): Promise<{ path: string; size: number }[]> {
  let entries;
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const files = await Promise.all(
    entries
      .filter((e) => e.isFile())
      .map(async (e) => {
        const full = join(e.parentPath, e.name);
        return { path: relative(root, full).split(sep).join('/'), size: (await lstat(full)).size };
      }),
  );
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

const isBinary = (b: Buffer): boolean => b.subarray(0, 8000).includes(0);

/** Unified diff of every file that differs between `before` (the fixtures) and `after` (`/app`). */
export async function diffTrees(before: string, after: string): Promise<string> {
  const [a, b] = await Promise.all([listFiles(before), listFiles(after)]);
  const paths = [...new Set([...a, ...b].map((f) => f.path))].sort();
  const read = async (root: string, inRoot: boolean, path: string) =>
    inRoot ? readFile(join(root, path)) : null;
  const inA = new Set(a.map((f) => f.path));
  const inB = new Set(b.map((f) => f.path));

  const parts: string[] = [];
  for (const path of paths) {
    const [old, cur] = await Promise.all([
      read(before, inA.has(path), path),
      read(after, inB.has(path), path),
    ]);
    if (old && cur && old.equals(cur)) continue;
    const oldName = old ? `a/${path}` : '/dev/null';
    const newName = cur ? `b/${path}` : '/dev/null';
    const tooBig = (old?.length ?? 0) > MAX_DIFF_BYTES || (cur?.length ?? 0) > MAX_DIFF_BYTES;
    if (tooBig || (old && isBinary(old)) || (cur && isBinary(cur))) {
      parts.push(
        `diff a/${path} b/${path}\n${tooBig ? 'Large' : 'Binary'} files ${oldName} and ${newName} differ\n`,
      );
      continue;
    }
    parts.push(
      `diff a/${path} b/${path}\n` +
        createTwoFilesPatch(
          oldName,
          newName,
          old?.toString('utf8') ?? '',
          cur?.toString('utf8') ?? '',
        )
          .split('\n')
          .slice(1) // drop jsdiff's "====" separator line
          .join('\n'),
    );
  }
  return parts.join('');
}

/** Parses JSON Lines; a line that is not JSON is kept as `{ type: 'unparsed', raw }`. */
export function parseJsonLines(text: string): unknown[] {
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        return { type: 'unparsed', raw: line };
      }
    });
}
