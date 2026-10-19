import {
  experimentSchema,
  factorViolation,
  type AgentConfig,
  type CreateExperiment,
  type Factor,
} from '@evals/shared';

export interface ExperimentForm {
  name: string;
  slug: string;
  hypothesis: string;
  factor: Factor;
  baselineConfigId: string;
  candidateConfigId: string;
  taskIds: string[];
  heldOutTaskIds: string[];
  repeats: number;
  concurrency: number;
  passThreshold: number;
  costCapUsd: number;
  seed: number;
}

export type FormErrors = Partial<Record<keyof ExperimentForm, string>>;

export const emptyForm = (seed = Math.floor(Math.random() * 1_000_000)): ExperimentForm => ({
  name: '',
  slug: '',
  hypothesis: '',
  factor: 'skills',
  baselineConfigId: '',
  candidateConfigId: '',
  taskIds: [],
  heldOutTaskIds: [],
  repeats: 3,
  concurrency: 4,
  passThreshold: 0.8,
  costCapUsd: 5,
  seed,
});

export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function toRequest(form: ExperimentForm): CreateExperiment {
  return {
    id: form.slug,
    name: form.name.trim(),
    hypothesis: form.hypothesis.trim(),
    factor: form.factor,
    taskIds: form.taskIds,
    baselineConfigId: form.baselineConfigId,
    candidateConfigId: form.candidateConfigId,
    repeats: form.repeats,
    concurrency: form.concurrency,
    passThreshold: form.passThreshold,
    costCapUsd: form.costCapUsd,
    seed: form.seed,
    heldOutTaskIds: form.heldOutTaskIds.filter((id) => form.taskIds.includes(id)),
  };
}

const FIELD_FOR_PATH: Record<string, keyof ExperimentForm> = { id: 'slug' };

/** The server's checks, client-side: the shared schema, then the one-factor rule. */
export function validate(
  form: ExperimentForm,
  configs: ReadonlyMap<string, AgentConfig>,
): FormErrors {
  const errors: FormErrors = {};
  const parsed = experimentSchema.safeParse(toRequest(form));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'name');
      const field = FIELD_FOR_PATH[key] ?? (key as keyof ExperimentForm);
      errors[field] ??= issue.message;
    }
  }
  if (form.taskIds.length === 0) errors.taskIds = 'Pick at least one task';
  if (!form.baselineConfigId) errors.baselineConfigId = 'Pick a baseline config';
  if (!form.candidateConfigId) errors.candidateConfigId = 'Pick a candidate config';
  const a = configs.get(form.baselineConfigId);
  const b = configs.get(form.candidateConfigId);
  if (a && b && !errors.candidateConfigId) {
    const violation = factorViolation(form.factor, a, b);
    if (violation) errors.candidateConfigId = violation;
  }
  return errors;
}

/** Configs that differ from `baseline` in exactly `factor`: the valid candidates. */
export function candidatesFor(
  factor: Factor,
  baselineId: string,
  configs: ReadonlyMap<string, AgentConfig>,
): AgentConfig[] {
  const baseline = configs.get(baselineId);
  if (!baseline) return [];
  return [...configs.values()].filter(
    (c) => c.id !== baselineId && factorViolation(factor, baseline, c) === null,
  );
}
