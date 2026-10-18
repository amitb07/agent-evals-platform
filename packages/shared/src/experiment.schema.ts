import { z } from 'zod';
import { slugSchema, unitIntervalSchema } from './common.schema';
import type { AgentConfig } from './config.schema';

export const factorSchema = z.enum(['skills', 'tools', 'memory', 'model']);
export type Factor = z.infer<typeof factorSchema>;

export const experimentSchema = z
  .strictObject({
    id: slugSchema,
    name: z.string().min(1),
    hypothesis: z.string().min(1),
    factor: factorSchema,
    taskIds: z.array(slugSchema).min(1),
    baselineConfigId: slugSchema,
    candidateConfigId: slugSchema,
    repeats: z.int().min(1).max(10),
    concurrency: z.int().min(1).max(16).default(4),
    passThreshold: unitIntervalSchema.default(0.8),
    costCapUsd: z.number().positive(),
    seed: z.int().nonnegative(),
    heldOutTaskIds: z.array(slugSchema).default([]),
  })
  .refine((e) => e.baselineConfigId !== e.candidateConfigId, {
    message: 'Baseline and candidate must be different configs',
    path: ['candidateConfigId'],
  })
  .refine((e) => new Set(e.taskIds).size === e.taskIds.length, {
    message: 'Task ids must be unique',
    path: ['taskIds'],
  })
  .refine((e) => e.heldOutTaskIds.every((id) => e.taskIds.includes(id)), {
    message: 'Held-out tasks must be part of taskIds',
    path: ['heldOutTaskIds'],
  });
export type Experiment = z.infer<typeof experimentSchema>;

const CONFIG_FIELD_GROUPS = {
  model: ['model', 'provider'],
  skills: ['skills'],
  tools: ['toolsets'],
  memory: ['memory'],
  runtime: ['hermesImageDigest', 'maxTurns'],
} as const satisfies Record<Factor | 'runtime', readonly (keyof AgentConfig)[]>;

type ConfigFieldGroup = keyof typeof CONFIG_FIELD_GROUPS;

const canonical = (value: unknown): string =>
  JSON.stringify(Array.isArray(value) ? [...(value as string[])].sort() : value);

export function changedConfigGroups(a: AgentConfig, b: AgentConfig): ConfigFieldGroup[] {
  return (Object.keys(CONFIG_FIELD_GROUPS) as ConfigFieldGroup[]).filter((group) =>
    CONFIG_FIELD_GROUPS[group].some((field) => canonical(a[field]) !== canonical(b[field])),
  );
}

/** Returns an error message unless baseline and candidate differ only in the experiment's factor. */
export function factorViolation(
  factor: Factor,
  baseline: AgentConfig,
  candidate: AgentConfig,
): string | null {
  const changed = changedConfigGroups(baseline, candidate);
  if (changed.length === 1 && changed[0] === factor) return null;
  return `Configs must differ only in ${factor}; they differ in: ${changed.join(', ') || 'nothing'}`;
}
