import { z } from 'zod';
import { sha256Schema, slugSchema, unitIntervalSchema } from './common.schema';
import { graderTypeSchema } from './grader.schema';

export const gradeCheckSchema = z.strictObject({
  graderId: slugSchema,
  type: graderTypeSchema,
  score: unitIntervalSchema,
  passed: z.boolean(),
  gate: z.boolean(),
  reason: z.string(),
  evidence: z.array(z.string()),
});
export type GradeCheck = z.infer<typeof gradeCheckSchema>;

/** `/logs/verifier/grades.json`, the full grading detail that ingestion stores. */
export const gradesSchema = z.strictObject({
  score: unitIntervalSchema,
  gatePassed: z.boolean(),
  passed: z.boolean(),
  checks: z.array(gradeCheckSchema).min(1),
  judge: z.strictObject({ model: z.string().min(1), promptHash: sha256Schema }).optional(),
});
export type Grades = z.infer<typeof gradesSchema>;

/** `/logs/verifier/reward.json`, the flat numeric map Harbor reads. */
export const rewardSchema = z.record(z.string(), z.number());
export type Reward = z.infer<typeof rewardSchema>;
