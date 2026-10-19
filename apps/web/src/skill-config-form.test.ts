import { describe, expect, it } from 'vitest';
import {
  emptySkillConfigForm,
  suggestedIdentity,
  toSkillConfigRequest,
  validateSkillConfig,
} from './skill-config-form';
import { config } from './test-fixtures';

const base = config('base', { name: 'Base' });
const filled = () => ({
  ...emptySkillConfigForm(),
  skillName: 'csv-tidy',
  description: 'House rules for CSV files.',
  instructions: '# CSV tidy\n\nUse semicolons as the delimiter.',
  id: 'base-csv-tidy',
  name: 'Base + csv-tidy',
});

describe('skill config form', () => {
  it('suggests an id and name from the base and the skill', () => {
    expect(suggestedIdentity(filled(), base)).toEqual({
      id: 'base-csv-tidy',
      name: 'Base + csv-tidy',
    });
    expect(suggestedIdentity({ ...filled(), skillName: '' }, base)).toEqual({ id: '', name: '' });
  });

  it('builds the request for a new or an existing skill', () => {
    expect(toSkillConfigRequest(filled()).skill).toEqual({
      kind: 'new',
      name: 'csv-tidy',
      description: 'House rules for CSV files.',
      instructions: '# CSV tidy\n\nUse semicolons as the delimiter.',
    });
    const existing = { ...filled(), mode: 'existing' as const, existingSkill: 'changelog-format' };
    expect(toSkillConfigRequest(existing).skill).toEqual({
      kind: 'existing',
      name: 'changelog-format',
    });
  });

  it('accepts a complete form and reports each problem on its field', () => {
    expect(validateSkillConfig(filled(), base, new Set(['base']))).toEqual({});
    const errors = validateSkillConfig(
      {
        ...filled(),
        skillName: 'Bad Name',
        description: '',
        instructions: '---\nname: x\n---\nmore than twenty characters',
        id: 'base',
      },
      base,
      new Set(['base']),
    );
    expect(errors.skillName).toMatch(/slug/);
    expect(errors.description).toMatch(/Describe/);
    expect(errors.instructions).toMatch(/front matter/);
    expect(errors.id).toBe('Config base already exists');
  });

  it('rejects a skill the base already has, and a missing base', () => {
    const withSkill = config('base-skill', { skills: ['csv-tidy'] });
    expect(validateSkillConfig(filled(), withSkill, new Set()).skillName).toMatch(/already has/);
    expect(validateSkillConfig(filled(), undefined, new Set()).baseConfigId).toBeDefined();
    const existing = { ...filled(), mode: 'existing' as const, existingSkill: '' };
    expect(validateSkillConfig(existing, base, new Set()).existingSkill).toBe('Pick a skill');
  });
});
