import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXPERIMENT_YAML, TASK_YAML, VALID_REPO, writeRepo } from './__fixtures__/repo';
import { loadRepo, SyncError } from './sync.loader';

async function issuesFor(files: Record<string, string>): Promise<string[]> {
  const error = await loadRepo(await writeRepo(files)).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(SyncError);
  return (error as SyncError).issues;
}

describe('loadRepo', () => {
  it('loads a valid repository with content hashes', async () => {
    const repo = await loadRepo(await writeRepo(VALID_REPO));
    expect(repo.tasks.map((t) => t.value.id)).toEqual(['csv-summary']);
    expect(repo.configs.map((c) => c.value.id)).toEqual(['base-skill', 'base']);
    expect(repo.experiments[0]?.value).toMatchObject({ concurrency: 4, passThreshold: 0.8 });
    expect(repo.tasks[0]?.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('treats missing directories as empty', async () => {
    const repo = await loadRepo(await mkdtemp(join(tmpdir(), 'evals-empty-')));
    expect(repo).toEqual({ tasks: [], configs: [], experiments: [] });
  });

  it('reports YAML syntax errors with file and line', async () => {
    const issues = await issuesFor({
      ...VALID_REPO,
      'configs/base.yaml': 'id: base\ntoolsets: [terminal,\nname: x\n',
    });
    expect(issues[0]).toMatch(/^configs\/base\.yaml:3:\d+ /);
  });

  it('reports schema errors at the offending line', async () => {
    const issues = await issuesFor({
      ...VALID_REPO,
      'tasks/csv-summary/task.yaml': TASK_YAML.replace('weight: 1', 'weight: 2'),
    });
    expect(issues).toContainEqual(
      expect.stringMatching(/^tasks\/csv-summary\/task\.yaml:11:\d+ graders\.0\.weight: /),
    );
  });

  it('points a missing key at its parent', async () => {
    const issues = await issuesFor({
      ...VALID_REPO,
      'tasks/csv-summary/task.yaml': TASK_YAML.replace(/^prompt: .*\n/m, ''),
    });
    expect(issues).toEqual([expect.stringMatching(/^tasks\/csv-summary\/task\.yaml:1:1 prompt: /)]);
  });

  it('reports cross-file problems', async () => {
    const issues = await issuesFor({
      ...VALID_REPO,
      'tasks/other-dir/task.yaml': TASK_YAML.replace('id: csv-summary', 'id: renamed'),
      'tasks/other-dir/fixtures/data/sales.csv': '',
      'tasks/csv-summary/task.yaml': TASK_YAML.replace('[data/sales.csv]', '[data/missing.csv]'),
      'configs/base-skill.yaml': VALID_REPO['configs/base-skill.yaml']!.replace(
        'changelog-format',
        'no-such-skill',
      ),
      'experiments/e1-skills.yaml': EXPERIMENT_YAML.replace('[csv-summary]', '[csv-summary, nope]'),
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        'tasks/other-dir/task.yaml: id "renamed" must match its directory name',
        'tasks/csv-summary/task.yaml: fixture "data/missing.csv" not found under tasks/csv-summary/fixtures/',
        'configs/base-skill.yaml: skill "no-such-skill" not found at skills/no-such-skill/SKILL.md',
        'experiments/e1-skills.yaml: unknown task "nope"',
      ]),
    );
  });

  it('rejects experiments whose configs differ in more than the factor', async () => {
    const issues = await issuesFor({
      ...VALID_REPO,
      'configs/base-skill.yaml': VALID_REPO['configs/base-skill.yaml']!.replace(
        'maxTurns: 40',
        'maxTurns: 10',
      ),
    });
    expect(issues).toEqual([
      'experiments/e1-skills.yaml: Configs must differ only in skills; they differ in: skills, runtime',
    ]);
  });

  it('rejects duplicate ids', async () => {
    const issues = await issuesFor({
      ...VALID_REPO,
      'configs/copy.yaml': VALID_REPO['configs/base.yaml']!,
    });
    expect(issues).toEqual(['configs/copy.yaml: id "base" is also defined in configs/base.yaml']);
  });

  it('rejects task directories without task.yaml', async () => {
    const issues = await issuesFor({ ...VALID_REPO, 'tasks/empty/notes.txt': '' });
    expect(issues).toEqual(['tasks/empty/task.yaml: missing']);
  });
});
