import { describe, expect, it } from 'vitest';
import { taskSchema } from './task.schema';

const task = {
  id: 'csv-summary-01',
  title: 'CSV revenue summary',
  category: 'tools',
  prompt: 'Read data/sales.csv and write report.md with total revenue per region.',
  timeoutSec: 300,
  graders: [{ type: 'file_exists', id: 'report-exists', path: 'report.md', weight: 1 }],
};

describe('taskSchema', () => {
  it('accepts a task and applies defaults', () => {
    expect(taskSchema.parse(task)).toMatchObject({ fixtures: [], tags: [] });
  });

  it('rejects unknown categories, bad slugs and unknown keys', () => {
    expect(taskSchema.safeParse({ ...task, category: 'web' }).success).toBe(false);
    expect(taskSchema.safeParse({ ...task, id: 'CSV Summary' }).success).toBe(false);
    expect(taskSchema.safeParse({ ...task, timeout: 300 }).success).toBe(false);
  });
});
