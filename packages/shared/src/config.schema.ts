import { z } from 'zod';
import { relativePathSchema, slugSchema } from './common.schema';

// `memory` and `skills` are excluded: the compiler sets them from `memory.mode` and `skills`.
export const toolsetSchema = z.enum([
  'terminal',
  'file',
  'code_execution',
  'web',
  'browser',
  'delegation',
  'session_search',
  'cronjob',
  'todo',
  'clarify',
  'vision',
  'image_gen',
  'tts',
  'computer_use',
  'connections',
]);
export type Toolset = z.infer<typeof toolsetSchema>;

const MEMORY_FILE_NAMES = new Set(['MEMORY.md', 'USER.md']);

export const memorySchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('off') }),
  z.strictObject({
    mode: z.literal('seeded'),
    files: z
      .array(relativePathSchema)
      .min(1)
      .refine((fs) => fs.every((f) => MEMORY_FILE_NAMES.has(f.split('/').pop()!)), {
        message: 'Seeded memory files must be named MEMORY.md or USER.md',
      }),
  }),
]);
export type MemoryConfig = z.infer<typeof memorySchema>;

export const agentConfigSchema = z.strictObject({
  id: slugSchema,
  name: z.string().min(1),
  hermesImageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  model: z.string().min(1),
  provider: z.literal('anthropic'),
  skills: z.array(slugSchema).default([]),
  toolsets: z.array(toolsetSchema).min(1),
  memory: memorySchema,
  maxTurns: z.int().positive(),
});
export type AgentConfig = z.infer<typeof agentConfigSchema>;
