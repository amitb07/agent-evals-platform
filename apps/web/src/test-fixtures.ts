import type { AgentConfig, ExperimentStats } from '@evals/shared';

const arm = {
  finished: 6,
  valid: 6,
  excluded: 0,
  gateFailures: 0,
  failures: {},
  passAt1: 0.5,
  passAtK: 1,
  passHatK: 0,
  costUsd: 0.06,
  costPerTrialUsd: 0.01,
  costPerPassUsd: 0.02,
  meanDurationMs: 20_000,
  meanTokens: 12_000,
};

export function stats(over: Partial<ExperimentStats> = {}): ExperimentStats {
  return {
    effect: 0.25,
    ciLow: 0.1,
    ciHigh: 0.4,
    verdict: 'better',
    verdictNote: null,
    twoStage: { effect: 0.25, ciLow: 0.05, ciHigh: 0.45 },
    mde: 0.2,
    nTasks: 6,
    k: 3,
    passThreshold: 0.8,
    iterations: 10_000,
    seed: 1,
    tasks: [],
    arms: { A: { ...arm }, B: { ...arm, excluded: 2 } },
    computedAt: '2026-10-19T00:00:00.000Z',
    ...over,
  };
}

const DIGEST = `sha256:${'a'.repeat(64)}`;

export const config = (id: string, over: Partial<AgentConfig> = {}): AgentConfig => ({
  id,
  name: id,
  hermesImageDigest: DIGEST,
  model: 'claude-sonnet-5',
  provider: 'anthropic',
  skills: [],
  toolsets: ['terminal', 'file'],
  memory: { mode: 'off' },
  maxTurns: 40,
  ...over,
});
