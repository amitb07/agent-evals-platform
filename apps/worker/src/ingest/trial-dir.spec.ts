import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { passingGrades, writeTrial } from './__fixtures__/trials';
import { readTrialDir } from './trial-dir';

describe('readTrialDir', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'evals-trials-'));
  });

  it('reads a graded trial', async () => {
    await writeTrial(dir, {
      name: 'hello__a',
      taskSlug: 'hello',
      arm: 'B',
      grades: passingGrades(1),
    });
    const state = await readTrialDir(join(dir, 'hello__a'), true);
    expect(state).toMatchObject({
      state: 'ready',
      record: {
        taskSlug: 'hello',
        arm: 'B',
        failureCause: null,
        rewardValid: true,
        grades: { score: 1 },
        costUsd: 0.01,
        turnExitReason: 'cli_close',
        exitCode: 0,
      },
    });
  });

  it('waits while a trial is unfinished or may still be retried', async () => {
    await writeTrial(dir, { name: 'a__1', taskSlug: 'a', arm: 'A', finished: false });
    await writeTrial(dir, {
      name: 'a__2',
      taskSlug: 'a',
      arm: 'A',
      exception: 'ApiRateLimitError',
      grades: null,
    });
    expect(await readTrialDir(join(dir, 'a__1'), true)).toMatchObject({
      state: 'not_ready',
      reason: 'trial still running',
    });
    expect(await readTrialDir(join(dir, 'a__2'), true)).toMatchObject({ state: 'not_ready' });
    expect(await readTrialDir(join(dir, 'missing'), true)).toMatchObject({
      state: 'not_ready',
      reason: 'no result.json',
    });
  });

  it('takes a retryable failure as final once Harbor has exited', async () => {
    await writeTrial(dir, {
      name: 'a__2',
      taskSlug: 'a',
      arm: 'A',
      exception: 'ApiRateLimitError',
      grades: null,
    });
    expect(await readTrialDir(join(dir, 'a__2'), false)).toMatchObject({
      state: 'ready',
      record: {
        failureCause: 'model_provider_failed',
        rewardValid: false,
        grades: null,
        error: 'ApiRateLimitError: boom',
      },
    });
  });

  it('treats an agent timeout as a final, valid failure while Harbor runs', async () => {
    await writeTrial(dir, {
      name: 'a__3',
      taskSlug: 'a',
      arm: 'A',
      exception: 'AgentTimeoutError',
      grades: passingGrades(0),
    });
    expect(await readTrialDir(join(dir, 'a__3'), true)).toMatchObject({
      state: 'ready',
      record: { failureCause: 'agent_exhausted_budget', rewardValid: true, grades: { score: 0 } },
    });
  });

  it('records a verifier failure when a clean trial has no grades', async () => {
    await writeTrial(dir, { name: 'a__4', taskSlug: 'a', arm: 'A', grades: null });
    expect(await readTrialDir(join(dir, 'a__4'), true)).toMatchObject({
      state: 'ready',
      record: {
        failureCause: 'verifier_failed',
        rewardValid: false,
        error: 'verifier finished without grades.json',
      },
    });
  });

  it('rejects malformed grades', async () => {
    await writeTrial(dir, {
      name: 'a__5',
      taskSlug: 'a',
      arm: 'A',
      files: { 'verifier/grades.json': '{"score": 2}' },
    });
    await expect(readTrialDir(join(dir, 'a__5'), true)).rejects.toThrow();
  });
});
