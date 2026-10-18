import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCodeCheck } from './checks';
import { workspace } from './test-helpers';

const base = { id: 'c', weight: 1, gate: false };

describe('file_exists', () => {
  it('passes for an existing file and fails for a missing one', async () => {
    const ws = await workspace({ 'report.md': '# r' });
    expect(
      await runCodeCheck(ws, { ...base, type: 'file_exists', path: 'report.md' }),
    ).toMatchObject({ score: 1, passed: true });
    expect(await runCodeCheck(ws, { ...base, type: 'file_exists', path: 'nope.md' })).toMatchObject(
      { score: 0, passed: false, reason: 'nope.md is missing' },
    );
  });

  it('rejects a symlink that escapes the workspace', async () => {
    const ws = await workspace();
    await symlink('/etc/hosts', join(ws, 'escape'));
    await expect(
      runCodeCheck(ws, { ...base, type: 'file_exists', path: 'escape' }),
    ).rejects.toThrow(/outside the workspace/);
  });
});

describe('regex', () => {
  it('matches with flags and reports the match as evidence', async () => {
    const ws = await workspace({ 'CHANGELOG.md': '## [1.2.0] - 2026-10-18\n' });
    const result = await runCodeCheck(ws, {
      ...base,
      type: 'regex',
      path: 'CHANGELOG.md',
      pattern: '^## \\[1\\.2\\.0\\]',
      flags: 'm',
    });
    expect(result).toMatchObject({ passed: true, evidence: ['## [1.2.0]'] });
  });

  it('fails on no match and on a missing file', async () => {
    const ws = await workspace({ 'a.md': 'x' });
    expect(
      (await runCodeCheck(ws, { ...base, type: 'regex', path: 'a.md', pattern: 'y' })).passed,
    ).toBe(false);
    expect(
      (await runCodeCheck(ws, { ...base, type: 'regex', path: 'b.md', pattern: 'y' })).reason,
    ).toBe('b.md is missing');
  });
});

describe('json', () => {
  it('gives partial credit per matching key', async () => {
    const ws = await workspace({
      'out.json': JSON.stringify({ total: 15, regions: ['north', 'south'], extra: 1 }),
    });
    const result = await runCodeCheck(ws, {
      ...base,
      type: 'json',
      path: 'out.json',
      expect: { total: 15, regions: ['south', 'north'] },
    });
    expect(result).toMatchObject({
      score: 0.5,
      passed: false,
      reason: '1/2 keys match in out.json',
    });
    expect(result.evidence[0]).toContain('regions: expected ["south","north"]');
  });

  it('fails on invalid JSON and on a non-object', async () => {
    const ws = await workspace({ 'bad.json': '{', 'arr.json': '[1]' });
    expect(
      (await runCodeCheck(ws, { ...base, type: 'json', path: 'bad.json', expect: { a: 1 } }))
        .reason,
    ).toBe('bad.json is not valid JSON');
    expect(
      (await runCodeCheck(ws, { ...base, type: 'json', path: 'arr.json', expect: { a: 1 } }))
        .reason,
    ).toBe('arr.json is not a JSON object');
  });
});

describe('command', () => {
  it('passes on exit 0 and runs in the workspace', async () => {
    const ws = await workspace({ 'hello.txt': 'Hello' });
    const result = await runCodeCheck(ws, {
      ...base,
      type: 'command',
      run: 'grep -q Hello hello.txt && echo ok',
    });
    expect(result).toMatchObject({ passed: true, reason: 'exit 0', evidence: ['stdout: ok\n'] });
  });

  it('fails on a non-zero exit with stderr as evidence', async () => {
    const ws = await workspace();
    const result = await runCodeCheck(ws, {
      ...base,
      type: 'command',
      run: 'echo boom >&2; exit 3',
    });
    expect(result).toMatchObject({ passed: false, reason: 'exit 3', evidence: ['stderr: boom\n'] });
  });

  it('kills the whole process group on timeout', async () => {
    const ws = await workspace();
    const started = Date.now();
    const result = await runCodeCheck(ws, {
      ...base,
      type: 'command',
      run: 'sleep 30 & sleep 30',
      timeoutSec: 1,
    });
    expect(result).toMatchObject({ passed: false, reason: 'timed out after 1s' });
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('never passes the judge key to check scripts', async () => {
    const ws = await workspace();
    const result = await runCodeCheck(
      ws,
      { ...base, type: 'command', run: 'test -z "${ANTHROPIC_API_KEY:-}"' },
      { ...process.env, ANTHROPIC_API_KEY: 'sk-secret' },
    );
    expect(result.passed).toBe(true);
  });
});
