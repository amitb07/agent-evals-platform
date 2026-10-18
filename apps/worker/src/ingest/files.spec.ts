import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTree } from '../compile/fs';
import { redact, storeTrialFiles } from './files';

describe('redact', () => {
  it('replaces every occurrence of each secret', () => {
    const out = redact(Buffer.from('a SECRET b SECRET c other'), ['SECRET', 'other', '']);
    expect(out.toString()).toBe('a [REDACTED] b [REDACTED] c [REDACTED]');
  });
});

describe('storeTrialFiles', () => {
  it('copies trial files with secrets redacted and returns paths relative to the data dir', async () => {
    const data = await mkdtemp(join(tmpdir(), 'evals-data-'));
    const trial = join(data, 'jobs', 'x', 'job', 'hello__a');
    await writeTree(trial, {
      'agent/events.jsonl': 'token sk-123\n',
      'agent/stderr.txt': 'nothing\n',
      'artifacts/app/notes/leak.txt': 'echoed sk-123\n',
      'verifier/grades.json': '{}',
    });
    const dest = join(data, 'trials', 't1');
    const paths = await storeTrialFiles(trial, dest, data, ['sk-123']);
    expect(paths).toEqual({
      eventsPath: 'trials/t1/agent/events.jsonl',
      stderrPath: 'trials/t1/agent/stderr.txt',
      workspacePath: 'trials/t1/workspace',
    });
    expect(await readFile(join(dest, 'agent/events.jsonl'), 'utf8')).toBe('token [REDACTED]\n');
    expect(await readFile(join(dest, 'workspace/notes/leak.txt'), 'utf8')).toBe(
      'echoed [REDACTED]\n',
    );
    expect(await readFile(join(dest, 'verifier/grades.json'), 'utf8')).toBe('{}');
  });
});
