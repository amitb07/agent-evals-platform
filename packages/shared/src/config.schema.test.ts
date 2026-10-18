import { describe, expect, it } from 'vitest';
import { agentConfigSchema } from './config.schema';

const config = {
  id: 'base',
  name: 'Baseline',
  hermesImageDigest: `sha256:${'a'.repeat(64)}`,
  model: 'claude-sonnet-5',
  provider: 'anthropic',
  toolsets: ['terminal', 'file'],
  memory: { mode: 'off' },
  maxTurns: 40,
};

describe('agentConfigSchema', () => {
  it('accepts memory off and seeded configs', () => {
    expect(agentConfigSchema.parse(config).skills).toEqual([]);
    const seeded = {
      ...config,
      memory: { mode: 'seeded', files: ['memory/seeded/MEMORY.md', 'memory/seeded/USER.md'] },
    };
    expect(agentConfigSchema.safeParse(seeded).success).toBe(true);
  });

  it('rejects compiler-managed toolsets', () => {
    expect(
      agentConfigSchema.safeParse({ ...config, toolsets: ['terminal', 'memory'] }).success,
    ).toBe(false);
    expect(agentConfigSchema.safeParse({ ...config, toolsets: ['skills'] }).success).toBe(false);
  });

  it('rejects wrongly named memory files and malformed digests', () => {
    const memory = { mode: 'seeded', files: ['memory/notes.md'] };
    expect(agentConfigSchema.safeParse({ ...config, memory }).success).toBe(false);
    expect(agentConfigSchema.safeParse({ ...config, hermesImageDigest: 'latest' }).success).toBe(
      false,
    );
  });
});
