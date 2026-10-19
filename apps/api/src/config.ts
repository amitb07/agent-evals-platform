import { isAbsolute } from 'node:path';
import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.url(),
  REPO_DIR: z.string().min(1),
  /** Same absolute path the worker writes trial files under. */
  DATA_DIR: z.string().refine(isAbsolute, 'Expected an absolute path'),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Only checked for presence: an experiment cannot be queued without it. */
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Load `seed/demo.json.gz` into an empty database at startup. */
  DEMO_SEED: z.stringbool().default(true),
});
export type ApiEnv = z.infer<typeof envSchema>;

export const API_ENV = Symbol('API_ENV');
