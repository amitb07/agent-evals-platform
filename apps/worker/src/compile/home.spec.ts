import { readdir } from 'node:fs/promises';
import { basename } from 'node:path';
import { parse } from 'yaml';
import {
  BASE_CONFIG,
  readTree,
  SEEDED_CONFIG,
  SKILL_CONFIG,
  tempDir,
  writeRepo,
} from './__fixtures__/repo';
import { compileHome, hermesToolsets } from './home';

describe('compileHome', () => {
  let repoDir: string;
  let outDir: string;

  beforeEach(async () => {
    repoDir = await writeRepo();
    outDir = await tempDir('bundles');
  });

  it('writes a memory-off bundle with no bundled skills', async () => {
    const home = await compileHome(BASE_CONFIG, { repoDir, outDir });
    expect(basename(home.dir)).toBe(`base-${home.hash.slice(0, 12)}`);
    expect(await readTree(home.dir)).toMatchSnapshot();
  });

  it('copies only the listed skills', async () => {
    const home = await compileHome(SKILL_CONFIG, { repoDir, outDir });
    expect(Object.keys(await readTree(home.dir))).toEqual([
      '.no-bundled-skills',
      'config.yaml',
      'skills/changelog-format/SKILL.md',
    ]);
  });

  it('seeds memory files and enables memory with staged writes', async () => {
    const home = await compileHome(SEEDED_CONFIG, { repoDir, outDir });
    const tree = await readTree(home.dir);
    expect(tree).toMatchSnapshot();
    expect(parse(tree['config.yaml']!)).toMatchObject({
      agent: { disabled_toolsets: ['skills'] },
      memory: { memory_enabled: true, write_approval: true },
    });
  });

  it('is content-addressed: same config, same directory; different config, different hash', async () => {
    const first = await compileHome(BASE_CONFIG, { repoDir, outDir });
    const again = await compileHome(BASE_CONFIG, { repoDir, outDir });
    const other = await compileHome({ ...BASE_CONFIG, maxTurns: 41 }, { repoDir, outDir });
    expect(again).toEqual(first);
    expect(other.hash).not.toBe(first.hash);
    expect((await readdir(outDir)).sort()).toEqual(
      [basename(first.dir), basename(other.dir)].sort(),
    );
  });

  it('gives the same hash in a different output directory', async () => {
    const a = await compileHome(SKILL_CONFIG, { repoDir, outDir });
    const b = await compileHome(SKILL_CONFIG, { repoDir, outDir: await tempDir('bundles') });
    expect(b.hash).toBe(a.hash);
  });

  it('fails when a skill file is missing and leaves no bundle behind', async () => {
    const config = { ...BASE_CONFIG, skills: ['missing-skill'] };
    await expect(compileHome(config, { repoDir, outDir })).rejects.toThrow(/SKILL\.md/);
    expect(await readdir(outDir)).toEqual([]);
  });

  it('rejects two seeded files with the same name', async () => {
    const config = {
      ...BASE_CONFIG,
      memory: { mode: 'seeded' as const, files: ['memory/seeded/MEMORY.md', 'other/MEMORY.md'] },
    };
    await expect(compileHome(config, { repoDir, outDir })).rejects.toThrow(/distinct names/);
  });
});

describe('hermesToolsets', () => {
  it('adds the memory toolset only for seeded memory', () => {
    expect(hermesToolsets(BASE_CONFIG)).toEqual(['terminal', 'file']);
    expect(hermesToolsets(SEEDED_CONFIG)).toEqual(['terminal', 'file', 'memory']);
  });
});
