import { readFile, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';

export const MAX_FILE_BYTES = 20_000;

/**
 * Resolves a task-relative path inside the workspace, following symlinks, and refuses anything that
 * ends up outside it (the agent controls the workspace and could plant a symlink to `/tests`).
 * Returns null when the file does not exist.
 */
export async function resolveInWorkspace(workspace: string, path: string): Promise<string | null> {
  const root = await realpath(workspace);
  let resolved: string;
  try {
    resolved = await realpath(join(root, path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new Error(`${path} resolves outside the workspace`);
  }
  return resolved;
}

export interface WorkspaceFile {
  path: string;
  content: string | null;
  truncated: boolean;
}

/** Reads a workspace file as UTF-8, capped at `MAX_FILE_BYTES`; `content` is null when missing. */
export async function readWorkspaceFile(workspace: string, path: string): Promise<WorkspaceFile> {
  const resolved = await resolveInWorkspace(workspace, path);
  if (!resolved) return { path, content: null, truncated: false };
  const bytes = await readFile(resolved);
  const truncated = bytes.length > MAX_FILE_BYTES;
  return {
    path,
    content: bytes.subarray(0, MAX_FILE_BYTES).toString('utf8'),
    truncated,
  };
}
