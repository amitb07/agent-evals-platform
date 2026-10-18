import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';

export type FileTree = Record<string, string | Buffer>;

/** Writes `files` (relative path → content) under `root`, creating parent directories. */
export async function writeTree(root: string, files: FileTree): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
}

/** Lists every file under `root` as sorted POSIX paths relative to `root`. */
export async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => relative(root, join(e.parentPath, e.name)).split(sep).join('/'))
    .sort();
}

/** sha256 over the sorted file list and bytes, so the same contents always give the same hash. */
export async function hashDir(root: string): Promise<string> {
  const hash = createHash('sha256');
  for (const file of await listFiles(root)) {
    const bytes = await readFile(join(root, file));
    hash.update(`${file}\0${bytes.length}\0`).update(bytes);
  }
  return hash.digest('hex');
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** Copies a file or directory, creating the destination's parent directory. */
export async function copy(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true });
  await cp(from, to, { recursive: true, errorOnExist: true, force: false });
}

/** Moves a finished temp directory into place; if `target` already exists the temp copy is dropped. */
export async function publishDir(tmp: string, target: string): Promise<void> {
  if (await exists(target)) {
    await rm(tmp, { recursive: true, force: true });
    return;
  }
  try {
    await rename(tmp, target);
  } catch (error) {
    // Another writer published the same content-addressed directory first.
    if (!(await exists(target))) throw error;
    await rm(tmp, { recursive: true, force: true });
  }
}
