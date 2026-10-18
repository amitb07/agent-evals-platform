import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { BASE_CONFIG, SEEDED_CONFIG, SKILL_CONFIG, tempDir } from './__fixtures__/repo';
import { jobConfig, writeJobConfig, type JobOptions } from './job';

const options = (b = SKILL_CONFIG): JobOptions => ({
  jobName: 'e1-skills',
  datasetDir: '/data/harbor-tasks/exp-1',
  repeats: 3,
  concurrency: 4,
  retries: 2,
  arms: [
    { arm: 'A', config: BASE_CONFIG, homeBundle: '/data/bundles/base-aaaa' },
    { arm: 'B', config: b, homeBundle: '/data/bundles/b-bbbb' },
  ],
});

describe('jobConfig', () => {
  it('describes both arms in one Harbor job', () => {
    expect(jobConfig(options())).toMatchSnapshot();
  });

  it('enables the memory toolset for a seeded arm', () => {
    const agents = jobConfig(options(SEEDED_CONFIG)).agents as { kwargs: { toolsets: string } }[];
    expect(agents.map((a) => a.kwargs.toolsets)).toEqual(['terminal,file', 'terminal,file,memory']);
  });

  it('writes the same config as YAML', async () => {
    const path = join(await tempDir('jobs'), 'exp-1', 'job.yaml');
    await writeJobConfig(path, options());
    expect(parse(await readFile(path, 'utf8'))).toEqual(jobConfig(options()));
  });
});
