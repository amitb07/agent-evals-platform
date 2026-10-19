import { z } from 'zod';
import { armSchema, isoDateTimeSchema, slugSchema, unitIntervalSchema } from './common.schema';
import { experimentSchema, factorSchema } from './experiment.schema';
import { gradeCheckSchema } from './grades.schema';
import { failureCauseSchema } from './harbor.schema';
import { taskCategorySchema } from './task.schema';

export const experimentStatusSchema = z.enum([
  'draft',
  'queued',
  'running',
  'stopped_budget',
  'completed',
  'failed',
]);
export type ExperimentStatus = z.infer<typeof experimentStatusSchema>;

export const trialStatusSchema = z.enum([
  'pending',
  'running',
  'graded',
  'failed',
  'ingest_failed',
]);
export type TrialStatus = z.infer<typeof trialStatusSchema>;

export const verdictSchema = z.enum(['better', 'worse', 'inconclusive']);
export type Verdict = z.infer<typeof verdictSchema>;

export const taskSummarySchema = z.object({
  slug: slugSchema,
  title: z.string(),
  category: taskCategorySchema,
  graderCount: z.int(),
});
export type TaskSummary = z.infer<typeof taskSummarySchema>;

export const configSummarySchema = z.object({
  slug: slugSchema,
  name: z.string(),
  model: z.string(),
  skills: z.array(z.string()),
  toolsets: z.array(z.string()),
  memoryMode: z.enum(['off', 'seeded']),
});
export type ConfigSummary = z.infer<typeof configSummarySchema>;

/** Where a skill lives: `skills/` in the repo, or created in the UI (stored under DATA_DIR). */
export const skillSourceSchema = z.enum(['repo', 'custom']);

export const skillSummarySchema = z.object({
  name: slugSchema,
  description: z.string(),
  source: skillSourceSchema,
});
export type SkillSummary = z.infer<typeof skillSummarySchema>;

export const skillDetailSchema = skillSummarySchema.extend({
  /** The full SKILL.md, front matter included. */
  content: z.string(),
});
export type SkillDetail = z.infer<typeof skillDetailSchema>;

/** Largest SKILL.md body the UI accepts; Hermes loads the whole file into the prompt. */
export const MAX_SKILL_CHARS = 40_000;

/** A skill written in the UI. The SKILL.md front matter is generated from name and description. */
export const newSkillSchema = z.strictObject({
  kind: z.literal('new'),
  name: slugSchema.max(64),
  description: z
    .string()
    .trim()
    .min(1, 'Describe when Hermes should use the skill')
    .max(300)
    .refine((d) => !/[\r\n]/.test(d), 'Keep the description on one line'),
  instructions: z
    .string()
    .trim()
    .min(20, 'Write the instructions Hermes should follow (at least 20 characters)')
    .max(MAX_SKILL_CHARS)
    .refine((t) => !t.startsWith('---'), 'Leave out the front matter; it is generated'),
});

/** `POST /configs`: a copy of a base config with one more skill, existing or new. */
export const createSkillConfigSchema = z.strictObject({
  id: slugSchema.max(80),
  name: z.string().trim().min(1).max(120),
  baseConfigId: slugSchema,
  skill: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('existing'), name: slugSchema }),
    newSkillSchema,
  ]),
});
export type CreateSkillConfig = z.infer<typeof createSkillConfigSchema>;

export const experimentSummarySchema = z.object({
  id: z.uuid(),
  slug: slugSchema,
  name: z.string(),
  factor: factorSchema,
  baselineConfig: slugSchema,
  candidateConfig: slugSchema,
  status: experimentStatusSchema,
  progress: z.object({ done: z.int(), total: z.int() }),
  spendUsd: z.number(),
  createdAt: isoDateTimeSchema,
});
export type ExperimentSummary = z.infer<typeof experimentSummarySchema>;

const armSummarySchema = z.object({
  trials: z.int(),
  valid: z.int(),
  passes: z.int(),
  meanScore: z.number().nullable(),
  costUsd: z.number(),
});

/** `POST /experiments` body: the experiment YAML shape. */
export const createExperimentSchema = experimentSchema;
export type CreateExperiment = z.input<typeof createExperimentSchema>;

export const experimentDetailSchema = experimentSummarySchema.extend({
  hypothesis: z.string(),
  stopRequested: z.boolean(),
  repeats: z.int(),
  concurrency: z.int(),
  passThreshold: unitIntervalSchema,
  costCapUsd: z.number(),
  seed: z.int(),
  heldOutTaskIds: z.array(slugSchema),
  error: z.string().nullable(),
  startedAt: isoDateTimeSchema.nullable(),
  finishedAt: isoDateTimeSchema.nullable(),
  tasks: z.array(
    z.object({
      taskId: z.uuid(),
      taskSlug: slugSchema,
      title: z.string(),
      category: taskCategorySchema,
      A: armSummarySchema,
      B: armSummarySchema,
    }),
  ),
});
export type ExperimentDetail = z.infer<typeof experimentDetailSchema>;

export const trialsQuerySchema = z.object({
  taskId: z.uuid().optional(),
  arm: armSchema.optional(),
});
export type TrialsQuery = z.infer<typeof trialsQuerySchema>;

export const trialSummarySchema = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  taskSlug: slugSchema,
  arm: armSchema,
  repeatIndex: z.int(),
  attempt: z.int(),
  status: trialStatusSchema,
  failureCause: failureCauseSchema.nullable(),
  rewardValid: z.boolean(),
  score: unitIntervalSchema.nullable(),
  passed: z.boolean().nullable(),
  costUsd: z.number().nullable(),
  durationMs: z.int().nullable(),
  startedAt: isoDateTimeSchema.nullable(),
});
export type TrialSummary = z.infer<typeof trialSummarySchema>;

export const trialDetailSchema = trialSummarySchema.extend({
  experimentId: z.uuid(),
  configSlug: slugSchema,
  /** The task prompt the agent received. */
  prompt: z.string(),
  turnExitReason: z.string().nullable(),
  exitCode: z.int().nullable(),
  tokensIn: z.int().nullable(),
  tokensOut: z.int().nullable(),
  cacheRead: z.int().nullable(),
  gatePassed: z.boolean().nullable(),
  error: z.string().nullable(),
  finishedAt: isoDateTimeSchema.nullable(),
  grades: z.array(gradeCheckSchema),
  manifest: z.record(z.string(), z.unknown()).nullable(),
});
export type TrialDetail = z.infer<typeof trialDetailSchema>;

export const trialDiffSchema = z.object({ diff: z.string() });
export type TrialDiff = z.infer<typeof trialDiffSchema>;

export const trialFileSchema = z.object({ path: z.string(), size: z.int() });
export type TrialFile = z.infer<typeof trialFileSchema>;

/** `null` when no task has valid trials in both arms. */
const confidenceIntervalSchema = z.object({
  effect: z.number().nullable(),
  ciLow: z.number().nullable(),
  ciHigh: z.number().nullable(),
});

const armMetricsSchema = z.object({
  /** Trials that finished (graded, failed or ingest_failed); pending and running ones are ignored. */
  finished: z.int(),
  valid: z.int(),
  /** Finished trials whose reward is invalid (infra failures); left out of every score. */
  excluded: z.int(),
  /** Valid trials whose gate check failed. */
  gateFailures: z.int(),
  /** Finished trials by failure cause, valid failures (agent budget) included. */
  failures: z.partialRecord(failureCauseSchema, z.int()),
  passAt1: unitIntervalSchema.nullable(),
  passAtK: unitIntervalSchema.nullable(),
  passHatK: unitIntervalSchema.nullable(),
  costUsd: z.number(),
  costPerTrialUsd: z.number().nullable(),
  costPerPassUsd: z.number().nullable(),
  meanDurationMs: z.number().nullable(),
  meanTokens: z.number().nullable(),
});
export type ArmMetrics = z.infer<typeof armMetricsSchema>;

export const taskStatsSchema = z.object({
  taskSlug: slugSchema,
  category: taskCategorySchema,
  heldOut: z.boolean(),
  nA: z.int(),
  nB: z.int(),
  meanA: z.number().nullable(),
  meanB: z.number().nullable(),
  delta: z.number().nullable(),
  sdA: z.number().nullable(),
  sdB: z.number().nullable(),
  flaky: z.boolean(),
  costA: z.number().nullable(),
  costB: z.number().nullable(),
});
export type TaskStats = z.infer<typeof taskStatsSchema>;

export const experimentStatsSchema = confidenceIntervalSchema.extend({
  verdict: verdictSchema,
  /** Why the verdict is inconclusive regardless of the CI (too few paired tasks), else null. */
  verdictNote: z.string().nullable(),
  twoStage: confidenceIntervalSchema,
  /** Retrospective minimum detectable effect at 95% confidence and 80% power. */
  mde: z.number().nullable(),
  /** Tasks with valid trials in both arms; the bootstrap unit. */
  nTasks: z.int(),
  k: z.int(),
  passThreshold: unitIntervalSchema,
  iterations: z.int(),
  seed: z.int(),
  tasks: z.array(taskStatsSchema),
  arms: z.object({ A: armMetricsSchema, B: armMetricsSchema }),
  computedAt: isoDateTimeSchema,
});
export type ExperimentStats = z.infer<typeof experimentStatsSchema>;

export const healthSchema = z.object({
  db: z.boolean(),
  dataDirWritable: z.boolean(),
  workerHeartbeatAgeSec: z.number().nullable(),
});
export type Health = z.infer<typeof healthSchema>;

export const apiErrorSchema = z.object({ error: z.string(), details: z.unknown().optional() });
export type ApiError = z.infer<typeof apiErrorSchema>;
