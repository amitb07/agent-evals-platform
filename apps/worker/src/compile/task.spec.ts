import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { CODE_ONLY_TASK, JUDGED_TASK, readTree, tempDir, writeRepo } from './__fixtures__/repo';
import { generateHarborTask, type TaskGenOptions } from './task';

describe('generateHarborTask', () => {
  let opts: TaskGenOptions;

  beforeEach(async () => {
    opts = {
      repoDir: await writeRepo(),
      outDir: await tempDir('harbor-tasks'),
      hermesImage: 'evals/hermes-runner:test',
      verifierImage: 'evals/verifier:test',
      passThreshold: 0.8,
    };
  });

  it('writes the Harbor task layout for a judged task', async () => {
    const task = await generateHarborTask(JUDGED_TASK, opts);
    expect(task.dir).toBe(join(opts.outDir, 'csv-summary'));
    expect(await readTree(task.dir)).toMatchSnapshot();
  });

  it('keeps the verifier offline and passes no key when there is no judge', async () => {
    const task = await generateHarborTask(CODE_ONLY_TASK, opts);
    const toml = (await readTree(task.dir))['task.toml']!;
    expect(toml).toMatchSnapshot();
    expect(toml).not.toContain('ANTHROPIC_API_KEY');
  });

  it('puts only listed fixtures in the agent workspace, and no grader files', async () => {
    const tree = await readTree((await generateHarborTask(JUDGED_TASK, opts)).dir);
    const environment = Object.keys(tree).filter((p) => p.startsWith('environment/'));
    expect(environment).toEqual(['environment/Dockerfile', 'environment/fixtures/data/sales.csv']);
  });

  it('makes test.sh executable', async () => {
    const task = await generateHarborTask(CODE_ONLY_TASK, opts);
    expect((await stat(join(task.dir, 'tests/test.sh'))).mode & 0o111).toBe(0o111);
  });

  it('keeps grader.json blind to configs and models', async () => {
    const tree = await readTree((await generateHarborTask(JUDGED_TASK, opts)).dir);
    expect(JSON.parse(tree['tests/grader.json']!)).toEqual({
      taskSlug: 'csv-summary',
      passThreshold: 0.8,
      graders: JUDGED_TASK.graders,
    });
  });

  it('regenerates from scratch and gives a stable hash', async () => {
    const first = await generateHarborTask(JUDGED_TASK, opts);
    const second = await generateHarborTask(JUDGED_TASK, opts);
    expect(second.hash).toBe(first.hash);
    const changed = await generateHarborTask({ ...JUDGED_TASK, timeoutSec: 301 }, opts);
    expect(changed.hash).not.toBe(first.hash);
  });

  it('fails when a listed fixture is missing', async () => {
    const task = { ...CODE_ONLY_TASK, fixtures: ['missing.txt'] };
    await expect(generateHarborTask(task, opts)).rejects.toThrow(/missing\.txt/);
  });
});
