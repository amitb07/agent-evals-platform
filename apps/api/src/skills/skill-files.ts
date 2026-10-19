import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SkillDetail, SkillSummary } from '@evals/shared';

/** Where skills live: the repo's `skills/` (from Git) and `DATA_DIR/skills` (created in the UI). */
export interface SkillRoots {
  repo: string;
  custom: string;
}

export const skillRoots = (repoDir: string, dataDir: string): SkillRoots => ({
  repo: join(repoDir, 'skills'),
  custom: join(dataDir, 'skills'),
});

/** The `description:` value from SKILL.md front matter, unquoted; '' when there is none. */
export function skillDescription(content: string): string {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1] ?? '';
  const raw = /^description:\s*(.*)$/m.exec(front)?.[1]?.trim() ?? '';
  if (raw.startsWith('"')) {
    try {
      return JSON.parse(raw) as string;
    } catch {
      return raw;
    }
  }
  return raw.replace(/^'(.*)'$/, '$1');
}

/** SKILL.md for a skill written in the UI, in the same shape as the repo's skills. */
export function renderSkill(name: string, description: string, instructions: string): string {
  return [
    '---',
    `name: ${name}`,
    `description: ${JSON.stringify(description)}`,
    'version: 1.0.0',
    '---',
    '',
    instructions.trim(),
    '',
  ].join('\n');
}

async function readSkill(root: string, name: string): Promise<string | null> {
  try {
    return await readFile(join(root, name, 'SKILL.md'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function names(root: string): Promise<string[]> {
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

/** Repo skills first; a custom skill with a repo skill's name is hidden (the repo one wins). */
export async function listSkills(roots: SkillRoots): Promise<SkillSummary[]> {
  const out: SkillSummary[] = [];
  const seen = new Set<string>();
  for (const source of ['repo', 'custom'] as const) {
    for (const name of (await names(roots[source])).sort()) {
      const content = seen.has(name) ? null : await readSkill(roots[source], name);
      if (content === null) continue;
      seen.add(name);
      out.push({ name, description: skillDescription(content), source });
    }
  }
  return out;
}

export async function getSkill(roots: SkillRoots, name: string): Promise<SkillDetail | null> {
  for (const source of ['repo', 'custom'] as const) {
    const content = await readSkill(roots[source], name);
    if (content !== null) return { name, description: skillDescription(content), source, content };
  }
  return null;
}

export class SkillExistsError extends Error {}

/** Creates `DATA_DIR/skills/<name>/SKILL.md`; fails if the name is taken in either root. */
export async function createCustomSkill(
  roots: SkillRoots,
  name: string,
  content: string,
): Promise<void> {
  if (await getSkill(roots, name)) throw new SkillExistsError(`Skill ${name} already exists`);
  await mkdir(roots.custom, { recursive: true });
  try {
    await mkdir(join(roots.custom, name)); // not recursive: fails if a concurrent request won
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new SkillExistsError(`Skill ${name} already exists`);
    }
    throw error;
  }
  await writeFile(join(roots.custom, name, 'SKILL.md'), content);
}

export async function removeCustomSkill(roots: SkillRoots, name: string): Promise<void> {
  await rm(join(roots.custom, name), { recursive: true, force: true });
}
