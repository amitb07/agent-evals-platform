import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { main } from './cli';
import { workspace } from './test-helpers';

const codeSpec = {
  taskSlug: 'hello',
  passThreshold: 0.8,
  graders: [
    { type: 'command', id: 'hello', run: 'grep -q Hermes hello.txt', weight: 1, gate: true },
  ],
};

async function run(spec: object, files: Record<string, string>, env: NodeJS.ProcessEnv = {}) {
  const ws = await workspace(files);
  const dir = await workspace();
  await writeFile(join(dir, 'grader.json'), JSON.stringify(spec));
  const out = join(dir, 'out');
  const code = await main(['--spec', join(dir, 'grader.json'), '--workspace', ws, '--out', out], {
    PATH: process.env.PATH,
    ...env,
  });
  return { code, out };
}

describe('grader cli', () => {
  it('writes reward.json and grades.json and exits 0 for a failed task', async () => {
    const { code, out } = await run(codeSpec, { 'hello.txt': 'nope' });
    expect(code).toBe(0);
    expect(JSON.parse(await readFile(join(out, 'reward.json'), 'utf8'))).toEqual({
      score: 0,
      gate_passed: 0,
      passed: 0,
      hello: 0,
    });
    expect(JSON.parse(await readFile(join(out, 'grades.json'), 'utf8'))).toMatchObject({
      score: 0,
      passed: false,
    });
  });

  it('exits 1 without reward.json when the spec is invalid', async () => {
    const { code, out } = await run({ ...codeSpec, passThreshold: 2 }, {});
    expect(code).toBe(1);
    await expect(readFile(join(out, 'reward.json'))).rejects.toThrow();
    expect(await readFile(join(out, 'grader-error.txt'), 'utf8')).toContain('passThreshold');
  });

  it('exits 1 when a judge grader has no JUDGE_MODEL', async () => {
    const spec = {
      ...codeSpec,
      graders: [{ type: 'llm_judge', id: 'j', rubric: 'r', files: ['a'], weight: 1 }],
    };
    const { code, out } = await run(spec, {}, { ANTHROPIC_API_KEY: 'k' });
    expect(code).toBe(1);
    expect(await readFile(join(out, 'grader-error.txt'), 'utf8')).toContain('JUDGE_MODEL');
  });
});
