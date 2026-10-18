import { z } from 'zod';
import { relativePathSchema, slugSchema, unitIntervalSchema } from './common.schema';

export const graderTypeSchema = z.enum(['file_exists', 'command', 'regex', 'json', 'llm_judge']);
export type GraderType = z.infer<typeof graderTypeSchema>;

const base = { id: slugSchema, weight: z.number().positive().max(1) };
const codeBase = { ...base, gate: z.boolean().default(false) };

function isValidRegex(pattern: string, flags?: string): boolean {
  try {
    new RegExp(pattern, flags);
    return true;
  } catch {
    return false;
  }
}

export const graderSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('file_exists'), ...codeBase, path: relativePathSchema }),
  z.strictObject({
    type: z.literal('command'),
    ...codeBase,
    run: z.string().min(1),
    timeoutSec: z.int().positive().optional(),
  }),
  z
    .strictObject({
      type: z.literal('regex'),
      ...codeBase,
      path: relativePathSchema,
      pattern: z.string().min(1),
      flags: z
        .string()
        .regex(/^[imsuv]*$/)
        .optional(),
    })
    .refine((g) => isValidRegex(g.pattern, g.flags), {
      message: 'Invalid regular expression',
      path: ['pattern'],
    }),
  z.strictObject({
    type: z.literal('json'),
    ...codeBase,
    path: relativePathSchema,
    expect: z
      .record(z.string(), z.unknown())
      .refine((e) => Object.keys(e).length > 0, 'Expected at least one key'),
  }),
  z.strictObject({
    type: z.literal('llm_judge'),
    ...base,
    rubric: z.string().min(1),
    files: z.array(relativePathSchema).min(1),
  }),
]);
export type Grader = z.infer<typeof graderSchema>;

/** Keys the grader writes into `reward.json` besides `gate_passed` and one key per grader id. */
export const RESERVED_REWARD_KEYS: ReadonlySet<string> = new Set(['score', 'passed']);

export const graderListSchema = z
  .array(graderSchema)
  .min(1)
  .refine((gs) => Math.abs(gs.reduce((sum, g) => sum + g.weight, 0) - 1) < 1e-9, {
    message: 'Grader weights must sum to 1',
  })
  .refine((gs) => new Set(gs.map((g) => g.id)).size === gs.length, {
    message: 'Grader ids must be unique',
  })
  .refine((gs) => gs.every((g) => !RESERVED_REWARD_KEYS.has(g.id)), {
    message: `Grader ids must not be one of: ${[...RESERVED_REWARD_KEYS].join(', ')}`,
  });

export const graderSpecSchema = z.strictObject({
  taskSlug: slugSchema,
  passThreshold: unitIntervalSchema,
  graders: graderListSchema,
});
export type GraderSpec = z.infer<typeof graderSpecSchema>;
