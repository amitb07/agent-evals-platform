import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  diffTrees,
  listFiles,
  parseJsonLines,
  resolveInside,
  UnsafePathError,
} from './trial-files';

async function tree(files: Record<string, string | Buffer>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'evals-files-'));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}

describe('resolveInside', () => {
  it('resolves files inside the root and returns null for missing ones', async () => {
    const root = await tree({ 'a/b.txt': 'x' });
    expect(await resolveInside(root, 'a/b.txt')).toMatch(/a\/b\.txt$/);
    expect(await resolveInside(root, 'nope.txt')).toBeNull();
  });

  it.each(['../secret', 'a/../../etc/passwd', '/etc/passwd', '', 'a\0b'])(
    'rejects %j',
    async (path) => {
      const root = await tree({ 'a/b.txt': 'x' });
      await expect(resolveInside(root, path)).rejects.toBeInstanceOf(UnsafePathError);
    },
  );

  it('rejects a symlink that points outside the root', async () => {
    const outside = await tree({ 'secret.txt': 'key' });
    const root = await tree({});
    await symlink(join(outside, 'secret.txt'), join(root, 'link.txt'));
    await expect(resolveInside(root, 'link.txt')).rejects.toBeInstanceOf(UnsafePathError);
  });
});

describe('listFiles', () => {
  it('lists regular files with sizes, skips symlinks, and treats a missing root as empty', async () => {
    const root = await tree({ 'b.txt': 'hello', 'a/c.md': '' });
    await symlink('/etc/hosts', join(root, 'hosts'));
    expect(await listFiles(root)).toEqual([
      { path: 'a/c.md', size: 0 },
      { path: 'b.txt', size: 5 },
    ]);
    expect(await listFiles(join(root, 'missing'))).toEqual([]);
  });
});

describe('diffTrees', () => {
  it('shows modified, added and deleted files and skips identical ones', async () => {
    const before = await tree({ 'same.txt': 'x\n', 'data.csv': 'a\nb\n', 'gone.txt': 'bye\n' });
    const after = await tree({ 'same.txt': 'x\n', 'data.csv': 'a\nc\n', 'report.md': '# R\n' });
    const diff = await diffTrees(before, after);
    expect(diff).not.toContain('same.txt');
    expect(diff).toContain('--- a/data.csv\n+++ b/data.csv\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n');
    expect(diff).toContain('--- /dev/null\n+++ b/report.md\n@@ -0,0 +1,1 @@\n+# R\n');
    expect(diff).toContain('--- a/gone.txt\n+++ /dev/null\n');
  });

  it('summarises binary files and treats missing fixtures as an empty tree', async () => {
    const after = await tree({ 'img.bin': Buffer.from([1, 0, 2]) });
    expect(await diffTrees(join(after, 'missing'), after)).toBe(
      'diff a/img.bin b/img.bin\nBinary files /dev/null and b/img.bin differ\n',
    );
  });
});

describe('parseJsonLines', () => {
  it('parses lines and keeps unparsable ones', () => {
    expect(parseJsonLines('{"type":"text"}\n\nnot json\n')).toEqual([
      { type: 'text' },
      { type: 'unparsed', raw: 'not json' },
    ]);
  });
});
