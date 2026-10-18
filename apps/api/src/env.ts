import { z } from 'zod';

export const env = z
  .object({
    DATABASE_URL: z.url(),
    REPO_DIR: z.string().min(1),
    PORT: z.coerce.number().int().positive().default(3000),
  })
  .parse(process.env);
