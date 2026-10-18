import { isAbsolute } from 'node:path';
import { z } from 'zod';

const absolutePath = z.string().refine(isAbsolute, 'Expected an absolute path');

export const envSchema = z.object({
  DATABASE_URL: z.url(),
  /**
   * Must be the same absolute path on the Docker host: Harbor bind-mounts trial log dirs from here
   * through the host Docker socket.
   */
  DATA_DIR: absolutePath,
  REPO_DIR: absolutePath,
  HERMES_IMAGE: z.string().min(1),
  VERIFIER_IMAGE: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional(),
  JUDGE_MODEL: z.string().min(1).default('claude-opus-5'),
  HARBOR_BIN: z.string().min(1).default('harbor'),
  HARBOR_RETRIES: z.coerce.number().int().min(0).default(2),
  /** Lets the end-to-end test swap in `hermes_harbor.fake_agent:FakeAgent`. */
  HARBOR_AGENT_IMPORT_PATH: z.string().min(1).default('hermes_harbor.hermes_agent:HermesAgent'),
  /** Directory that contains the `hermes_harbor` package; added to Harbor's PYTHONPATH. */
  ADAPTER_DIR: absolutePath.optional(),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  GIT_SHA: z.string().optional(),
});
export type WorkerEnv = z.infer<typeof envSchema>;

export const WORKER_ENV = Symbol('WORKER_ENV');
