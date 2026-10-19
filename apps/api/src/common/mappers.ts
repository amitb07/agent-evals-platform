import type { AgentConfig as AgentConfigRow, Task as TaskRow } from '@evals/db';
import {
  graderListSchema,
  memorySchema,
  type AgentConfig,
  type ConfigSummary,
  type Task,
  type TaskSummary,
} from '@evals/shared';

export const iso = (d: Date | null): string | null => d?.toISOString() ?? null;

/** DB row → the YAML shape (`id` is the slug). JSON columns are re-validated. */
export function toTask(row: TaskRow): Task {
  return {
    id: row.slug,
    title: row.title,
    category: row.category,
    prompt: row.prompt,
    fixtures: row.fixtures,
    timeoutSec: row.timeoutSec,
    tags: row.tags,
    graders: graderListSchema.parse(row.graders),
  };
}

export function toTaskSummary(row: TaskRow): TaskSummary {
  return {
    slug: row.slug,
    title: row.title,
    category: row.category,
    graderCount: Array.isArray(row.graders) ? row.graders.length : 0,
  };
}

export function toAgentConfig(row: AgentConfigRow): AgentConfig {
  return {
    id: row.slug,
    name: row.name,
    hermesImageDigest: row.hermesImageDigest,
    model: row.model,
    provider: 'anthropic',
    skills: row.skills,
    toolsets: row.toolsets as AgentConfig['toolsets'],
    memory: memorySchema.parse(row.memory),
    maxTurns: row.maxTurns,
  };
}

export function toConfigSummary(row: AgentConfigRow): ConfigSummary {
  return {
    slug: row.slug,
    name: row.name,
    model: row.model,
    skills: row.skills,
    toolsets: row.toolsets,
    memoryMode: memorySchema.parse(row.memory).mode,
  };
}
