import { describe, expect, it } from 'vitest';
import { candidatesFor, emptyForm, slugify, toRequest, validate } from './experiment-form';
import { config } from './test-fixtures';

const configs = new Map(
  [
    config('base'),
    config('base-skill', { skills: ['changelog-format'] }),
    config('base-opus', { model: 'claude-opus-5' }),
  ].map((c) => [c.id, c]),
);

const valid = () => ({
  ...emptyForm(1),
  name: 'E1 skills',
  slug: 'e1-skills',
  hypothesis: 'The skill helps.',
  baselineConfigId: 'base',
  candidateConfigId: 'base-skill',
  taskIds: ['a', 'b'],
  heldOutTaskIds: ['b', 'not-selected'],
});

describe('experiment form', () => {
  it('accepts a valid form and drops held-outs that are not selected', () => {
    expect(validate(valid(), configs)).toEqual({});
    expect(toRequest(valid()).heldOutTaskIds).toEqual(['b']);
  });

  it('reports schema errors per field', () => {
    const errors = validate(
      { ...valid(), name: ' ', slug: 'Bad Slug', repeats: 0, costCapUsd: 0, taskIds: [] },
      configs,
    );
    expect(Object.keys(errors).sort()).toEqual([
      'costCapUsd',
      'name',
      'repeats',
      'slug',
      'taskIds',
    ]);
    expect(errors.taskIds).toBe('Pick at least one task');
  });

  it('enforces the one-factor rule', () => {
    const errors = validate({ ...valid(), candidateConfigId: 'base-opus' }, configs);
    expect(errors.candidateConfigId).toBe(
      'Configs must differ only in skills; they differ in: model',
    );
  });

  it('offers only candidates that differ in the factor', () => {
    expect(candidatesFor('skills', 'base', configs).map((c) => c.id)).toEqual(['base-skill']);
    expect(candidatesFor('model', 'base', configs).map((c) => c.id)).toEqual(['base-opus']);
    expect(candidatesFor('tools', 'base', configs)).toEqual([]);
    expect(candidatesFor('skills', '', configs)).toEqual([]);
  });

  it('slugifies names', () => {
    expect(slugify('  E1: Skills (v2)! ')).toBe('e1-skills-v2');
  });
});
