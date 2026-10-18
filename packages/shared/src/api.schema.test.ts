import { describe, expect, it } from 'vitest';
import { experimentSummarySchema, trialsQuerySchema } from './api.schema';

const summary = {
  id: '6f1c2a5e-8a1b-4c3d-9e2f-0a1b2c3d4e5f',
  slug: 'e1-skills',
  name: 'E1 skills',
  factor: 'skills',
  baselineConfig: 'base',
  candidateConfig: 'base-skill',
  status: 'running',
  progress: { done: 10, total: 72 },
  spendUsd: 0.42,
  createdAt: '2026-10-18T17:26:43.204950Z',
};

describe('api schemas', () => {
  it('accepts an experiment summary', () => {
    expect(experimentSummarySchema.safeParse(summary).success).toBe(true);
  });

  it('rejects an unknown status and a bad trials query', () => {
    expect(experimentSummarySchema.safeParse({ ...summary, status: 'paused' }).success).toBe(false);
    expect(trialsQuerySchema.safeParse({ arm: 'C' }).success).toBe(false);
  });
});
