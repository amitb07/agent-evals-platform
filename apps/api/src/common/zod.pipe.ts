import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Validates and parses a request body or query with a shared zod schema; 400 with the issues. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new BadRequestException({
      error: 'Validation failed',
      details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
}
