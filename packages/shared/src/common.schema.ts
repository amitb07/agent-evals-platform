import { z } from 'zod';

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Expected a kebab-case slug');

export const relativePathSchema = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith('/') && !p.split('/').includes('..'), {
    message: 'Expected a relative path without ".."',
  });

export const unitIntervalSchema = z.number().min(0).max(1);

export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const armSchema = z.enum(['A', 'B']);
export type Arm = z.infer<typeof armSchema>;
