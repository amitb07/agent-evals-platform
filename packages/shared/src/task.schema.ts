import { z } from 'zod';
import { relativePathSchema, slugSchema } from './common.schema';
import { graderListSchema } from './grader.schema';

export const taskCategorySchema = z.enum(['tools', 'coding', 'skill', 'memory', 'open']);
export type TaskCategory = z.infer<typeof taskCategorySchema>;

export const taskSchema = z.strictObject({
  id: slugSchema,
  title: z.string().min(1),
  category: taskCategorySchema,
  prompt: z.string().min(1),
  fixtures: z.array(relativePathSchema).default([]),
  timeoutSec: z.int().positive(),
  tags: z.array(z.string().min(1)).default([]),
  graders: graderListSchema,
});
export type Task = z.infer<typeof taskSchema>;
