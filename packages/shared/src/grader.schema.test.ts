import { describe, expect, it } from 'vitest';
import { graderListSchema, graderSchema, graderSpecSchema } from './grader.schema';

const graders = [
  { type: 'file_exists', id: 'report-exists', path: 'report.md', weight: 0.2 },
  {
    type: 'command',
    id: 'totals',
    run: 'node /tests/checks/check_report.js report.md',
    weight: 0.6,
    gate: true,
  },
  { type: 'llm_judge', id: 'clarity', rubric: 'Is it a table?', files: ['report.md'], weight: 0.2 },
];

describe('graderListSchema', () => {
  it('accepts weights that sum to 1 and defaults gate to false', () => {
    const parsed = graderListSchema.parse(graders);
    expect(parsed[0]).toMatchObject({ gate: false });
    expect(parsed[1]).toMatchObject({ gate: true });
  });

  it('rejects weights that do not sum to 1', () => {
    const result = graderListSchema.safeParse([{ ...graders[0], weight: 0.5 }]);
    expect(result.error?.issues[0]?.message).toBe('Grader weights must sum to 1');
  });

  it('rejects duplicate grader ids', () => {
    const result = graderListSchema.safeParse([
      { ...graders[0], weight: 0.5 },
      { ...graders[0], weight: 0.5 },
    ]);
    expect(result.error?.issues[0]?.message).toBe('Grader ids must be unique');
  });
});

describe('graderSchema', () => {
  it('rejects grader ids that clash with reward.json keys', () => {
    const result = graderListSchema.safeParse([{ ...graders[0], id: 'score', weight: 1 }]);
    expect(result.error?.issues[0]?.message).toMatch(/must not be one of: score, passed/);
  });

  it('accepts regex and json graders', () => {
    expect(
      graderSchema.safeParse({
        type: 'regex',
        id: 'heading',
        path: 'CHANGELOG.md',
        pattern: '^## \\[',
        flags: 'm',
        weight: 1,
      }).success,
    ).toBe(true);
    expect(
      graderSchema.safeParse({
        type: 'json',
        id: 'out',
        path: 'out.json',
        expect: { total: 3 },
        weight: 1,
      }).success,
    ).toBe(true);
  });

  it('never allows an llm_judge gate', () => {
    expect(graderSchema.safeParse({ ...graders[2], gate: true }).success).toBe(false);
  });

  it('rejects an invalid regular expression', () => {
    const result = graderSchema.safeParse({
      type: 'regex',
      id: 'bad',
      path: 'a.md',
      pattern: '(',
      weight: 1,
    });
    expect(result.error?.issues[0]?.path).toEqual(['pattern']);
  });

  it.each(['/etc/passwd', '../secret', 'a/../../b'])('rejects path %s', (path) => {
    expect(graderSchema.safeParse({ ...graders[0], path }).success).toBe(false);
  });

  it('rejects an empty json expectation', () => {
    const result = graderSchema.safeParse({
      type: 'json',
      id: 'out',
      path: 'out.json',
      expect: {},
      weight: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe('graderSpecSchema', () => {
  it('accepts the verifier spec', () => {
    expect(
      graderSpecSchema.safeParse({ taskSlug: 'csv-summary-01', passThreshold: 0.8, graders })
        .success,
    ).toBe(true);
  });

  it('rejects a pass threshold above 1', () => {
    expect(
      graderSpecSchema.safeParse({ taskSlug: 'csv-summary-01', passThreshold: 1.5, graders })
        .success,
    ).toBe(false);
  });
});
