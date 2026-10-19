import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { AgentConfig } from '@evals/shared';
import { stringify } from 'yaml';
import { copy, exists, hashDir, publishDir, writeTree } from './fs';

export interface CompiledHome {
  dir: string;
  hash: string;
}

/**
 * The Hermes `config.yaml` for one config. Every self-learning path is off; with seeded memory the
 * agent may read memory but writes are only staged (`write_approval`) and die with the container.
 * Keys verified against Hermes v0.22.2 in the day-1 spike (implementation plan §16).
 */
export function hermesSettings(config: AgentConfig): Record<string, unknown> {
  const seeded = config.memory.mode === 'seeded';
  return {
    agent: {
      max_turns: config.maxTurns,
      disabled_toolsets: seeded ? ['skills'] : ['memory', 'skills'],
    },
    memory: seeded
      ? { memory_enabled: true, user_profile_enabled: true, write_approval: true }
      : { memory_enabled: false, user_profile_enabled: false },
    auxiliary: { background_review: { enabled: false } },
    database: { journal_mode: 'delete' },
    terminal: { cwd: '/app' },
  };
}

/** The Hermes toolsets passed with `-t`; `memory` is added only when memory is seeded. */
export function hermesToolsets(config: AgentConfig): string[] {
  return config.memory.mode === 'seeded' ? [...config.toolsets, 'memory'] : [...config.toolsets];
}

/** The skill's SKILL.md: the repo's `skills/` first, then the custom skills directory. */
async function skillFile(
  skill: string,
  opts: { repoDir: string; customSkillsDir?: string },
): Promise<string> {
  const repo = join(opts.repoDir, 'skills', skill, 'SKILL.md');
  if ((await exists(repo)) || !opts.customSkillsDir) return repo;
  return join(opts.customSkillsDir, skill, 'SKILL.md');
}

/**
 * Writes the Hermes home bundle for `config` to `<outDir>/<configSlug>-<hash12>/`. The directory is
 * content-addressed, so compiling an unchanged config reuses the existing bundle.
 */
export async function compileHome(
  config: AgentConfig,
  opts: {
    repoDir: string;
    outDir: string;
    /** Skills created in the UI (`DATA_DIR/skills`); used when the repo has no skill of that name. */
    customSkillsDir?: string;
  },
): Promise<CompiledHome> {
  await mkdir(opts.outDir, { recursive: true });
  const tmp = await mkdtemp(join(opts.outDir, `.tmp-${config.id}-`));

  try {
    await writeTree(tmp, {
      'config.yaml': stringify(hermesSettings(config)),
      '.no-bundled-skills': '',
    });
    for (const skill of config.skills) {
      await copy(await skillFile(skill, opts), join(tmp, 'skills', skill, 'SKILL.md'));
    }
    if (config.memory.mode === 'seeded') {
      const names = config.memory.files.map((file) => basename(file));
      if (new Set(names).size !== names.length) {
        throw new Error(`Config ${config.id}: seeded memory files must have distinct names`);
      }
      for (const file of config.memory.files) {
        await copy(join(opts.repoDir, file), join(tmp, 'memories', basename(file)));
      }
    }
  } catch (error) {
    await rm(tmp, { recursive: true, force: true });
    throw error;
  }

  const hash = await hashDir(tmp);
  const dir = join(opts.outDir, `${config.id}-${hash.slice(0, 12)}`);
  await publishDir(tmp, dir);
  return { dir, hash };
}
