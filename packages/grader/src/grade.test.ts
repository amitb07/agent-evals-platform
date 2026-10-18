import { graderSpecSchema, gradesSchema } from '@evals/shared';
import { describe, expect, it, vi } from 'vitest';
import { grade, toReward } from './grade';
import type { Judge } from './judge';
import { workspace } from './test-helpers';

const spec = graderSpecSchema.parse({
  taskSlug: 'csv-summary',
  passThreshold: 0.8,
  graders: [
    { type: 'file_exists', id: 'exists', path: 'report.md', weight: 0.2 },
    {
      type: 'regex',
      id: 'totals',
      path: 'report.md',
      pattern: 'north \\| 10',
      weight: 0.6,
      gate: true,
    },
    {
      type: 'llm_judge',
      id: 'clarity',
      rubric: 'Is it a table?',
      files: ['report.md'],
      weight: 0.2,
    },
  ],
});

const fakeJudge = (score: number): Judge => ({
  model: 'judge-model',
  judge: vi
    .fn()
    .mockResolvedValue({ score, passed: score >= 0.5, unknown: false, reason: 'ok', evidence: [] }),
});

describe('grade', () => {
  it('weights every check when gates pass', async () => {
    const ws = await workspace({ 'report.md': '| north | 10 |' });
    const grades = await grade(spec, { workspace: ws, judge: fakeJudge(0.5) });
    expect(gradesSchema.parse(grades)).toMatchObject({
      score: 0.9,
      gatePassed: true,
      passed: true,
      judge: { model: 'judge-model' },
    });
    expect(grades.checks.map((c) => c.graderId)).toEqual(['exists', 'totals', 'clarity']);
  });

  it('caps the score and skips the judge when a gate fails', async () => {
    const ws = await workspace({ 'report.md': 'wrong but well written' });
    const judge = fakeJudge(1);
    const judgeSpy = vi.spyOn(judge, 'judge');
    const grades = await grade(spec, { workspace: ws, judge });
    expect(grades).toMatchObject({ score: 0.2, gatePassed: false, passed: false });
    expect(grades.checks[2]).toMatchObject({ score: 0, reason: 'skipped: a gate check failed' });
    expect(judgeSpy).not.toHaveBeenCalled();
    expect(grades.judge).toBeUndefined();
  });

  it('fails below the pass threshold even when gates pass', async () => {
    const ws = await workspace({ 'report.md': '| north | 10 |' });
    expect(
      await grade({ ...spec, passThreshold: 0.95 }, { workspace: ws, judge: fakeJudge(0.5) }),
    ).toMatchObject({ score: 0.9, passed: false });
  });

  it('needs a judge only when one is reached', async () => {
    const ws = await workspace({ 'report.md': '| north | 10 |' });
    await expect(grade(spec, { workspace: ws })).rejects.toThrow(/needs a judge/);
  });
});

describe('toReward', () => {
  it('writes a flat numeric map with one key per grader', async () => {
    const ws = await workspace({ 'report.md': '| north | 10 |' });
    expect(toReward(await grade(spec, { workspace: ws, judge: fakeJudge(0.5) }))).toEqual({
      score: 0.9,
      gate_passed: 1,
      passed: 1,
      exists: 1,
      totals: 1,
      clarity: 0.5,
    });
  });
});
