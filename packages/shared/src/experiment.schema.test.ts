import { describe, expect, it } from 'vitest';
import { agentConfigSchema, type AgentConfig } from './config.schema';
import { changedConfigGroups, experimentSchema, factorViolation } from './experiment.schema';

const experiment = {
  id: 'e1-skills',
  name: 'E1 skills',
  hypothesis: 'The changelog skill improves skill tasks.',
  factor: 'skills',
  taskIds: ['changelog-01', 'changelog-02', 'csv-summary-01'],
  baselineConfigId: 'base',
  candidateConfigId: 'base-skill',
  repeats: 3,
  costCapUsd: 15,
  seed: 42,
  heldOutTaskIds: ['changelog-02'],
};

const base: AgentConfig = agentConfigSchema.parse({
  id: 'base',
  name: 'Baseline',
  hermesImageDigest: `sha256:${'a'.repeat(64)}`,
  model: 'claude-sonnet-5',
  provider: 'anthropic',
  skills: ['a', 'b'],
  toolsets: ['terminal', 'file'],
  memory: { mode: 'off' },
  maxTurns: 40,
});

describe('experimentSchema', () => {
  it('accepts an experiment and applies defaults', () => {
    expect(experimentSchema.parse(experiment)).toMatchObject({
      concurrency: 4,
      passThreshold: 0.8,
    });
  });

  it('rejects held-out tasks outside the task list', () => {
    const result = experimentSchema.safeParse({ ...experiment, heldOutTaskIds: ['other'] });
    expect(result.error?.issues[0]?.path).toEqual(['heldOutTaskIds']);
  });

  it('rejects identical baseline and candidate', () => {
    const result = experimentSchema.safeParse({ ...experiment, candidateConfigId: 'base' });
    expect(result.error?.issues[0]?.path).toEqual(['candidateConfigId']);
  });
});

describe('factorViolation', () => {
  it('passes when only the factor group differs', () => {
    expect(factorViolation('skills', base, { ...base, skills: ['a', 'b', 'c'] })).toBeNull();
    expect(factorViolation('model', base, { ...base, model: 'claude-haiku-4-5' })).toBeNull();
    expect(
      factorViolation('memory', base, {
        ...base,
        memory: { mode: 'seeded', files: ['memory/MEMORY.md'] },
      }),
    ).toBeNull();
  });

  it('ignores the order of list fields', () => {
    expect(changedConfigGroups(base, { ...base, skills: ['b', 'a'] })).toEqual([]);
  });

  it('fails when another group or nothing differs', () => {
    expect(factorViolation('tools', base, { ...base, skills: ['a'] })).toMatch(/differ in: skills/);
    expect(factorViolation('skills', base, { ...base, skills: ['a'], maxTurns: 10 })).toMatch(
      /differ in: skills, runtime/,
    );
    expect(factorViolation('skills', base, { ...base, id: 'copy' })).toMatch(/differ in: nothing/);
  });
});
