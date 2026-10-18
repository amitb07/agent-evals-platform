import { describe, expect, it } from 'vitest';
import { gradesSchema, rewardSchema } from './grades.schema';

const grades = {
  score: 0.8,
  gatePassed: true,
  passed: true,
  checks: [
    {
      graderId: 'totals',
      type: 'command',
      score: 1,
      passed: true,
      gate: true,
      reason: 'exit 0',
      evidence: ['ok'],
    },
  ],
  judge: { model: 'claude-opus-5', promptHash: 'b'.repeat(64) },
};

describe('gradesSchema', () => {
  it('accepts grader output', () => {
    expect(gradesSchema.safeParse(grades).success).toBe(true);
  });

  it('rejects scores outside 0..1 and empty checks', () => {
    expect(gradesSchema.safeParse({ ...grades, score: 1.2 }).success).toBe(false);
    expect(gradesSchema.safeParse({ ...grades, checks: [] }).success).toBe(false);
  });
});

describe('rewardSchema', () => {
  it('accepts only a flat numeric map', () => {
    expect(rewardSchema.safeParse({ score: 0.8, gate_passed: 1, totals: 1 }).success).toBe(true);
    expect(rewardSchema.safeParse({ score: '0.8' }).success).toBe(false);
  });
});
