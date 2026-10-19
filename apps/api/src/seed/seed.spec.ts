import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { PrismaService, ensureTrialMatrix } from '@evals/db';
import { VALID_REPO, writeRepo } from '../sync/__fixtures__/repo';
import { SyncService } from '../sync/sync.service';
import { exportSeed, loadSeed, SeedError } from './seed-bundle';

const databaseUrl = process.env.TEST_DATABASE_URL;

async function put(root: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

(databaseUrl ? describe : describe.skip)('demo seed (needs TEST_DATABASE_URL)', () => {
  let prisma: PrismaService;
  let repo: string;

  beforeAll(async () => {
    prisma = new PrismaService(databaseUrl!);
    await prisma.$connect();
  });
  afterAll(() => prisma.$disconnect());

  const reset = async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "Task", "AgentConfig", "Experiment" CASCADE');
    await new SyncService(prisma, repo).run();
  };

  /** e1-skills with 6 graded trials and their files under `dataDir`. */
  async function finishedExperiment(dataDir: string): Promise<string> {
    const e = await prisma.experiment.findUniqueOrThrow({ where: { slug: 'e1-skills' } });
    await prisma.$transaction((tx) => ensureTrialMatrix(tx, e.id));
    const trials = await prisma.trial.findMany({ where: { experimentId: e.id } });
    for (const [i, t] of trials.entries()) {
      const dir = `trials/${t.id}`;
      await put(
        dataDir,
        `${dir}/agent/events.jsonl`,
        '{"type":"text","text":"hi","timestamp":1}\n',
      );
      await put(dataDir, `${dir}/workspace/report.md`, `# Report ${i}\n`);
      await prisma.trial.update({
        where: { id: t.id },
        data: {
          harborTrialName: `trial-${i}`,
          status: 'graded',
          rewardValid: true,
          score: t.arm === 'B' ? 1 : 0.5,
          passed: t.arm === 'B',
          costUsd: 0.01,
          startedAt: new Date('2026-10-19T04:30:00Z'),
          eventsPath: `${dir}/agent/events.jsonl`,
          workspacePath: `${dir}/workspace`,
          grades: {
            create: {
              graderId: 'report-exists',
              type: 'file_exists',
              score: 1,
              passed: true,
              gate: false,
              reason: 'report.md exists',
              evidence: [],
            },
          },
          manifest: { create: { json: { harborVersion: '0.24.0' } } },
        },
      });
    }
    const first = trials.find((t) => t.repeatIndex === 0 && t.arm === 'A')!;
    await writeFile(
      join(dataDir, `trials/${first.id}/workspace/bin.dat`),
      Buffer.from([0, 1, 255]),
    );
    await put(
      dataDir,
      `harbor-tasks/${e.id}/csv-summary/environment/fixtures/data/sales.csv`,
      'r\n',
    );
    await prisma.experiment.update({
      where: { id: e.id },
      data: { status: 'completed', finishedAt: new Date('2026-10-19T04:50:00Z') },
    });
    return e.id;
  }

  beforeEach(async () => {
    repo = await writeRepo(VALID_REPO);
    await reset();
  });

  it('round-trips experiments, trials, grades, manifests and files into an empty database', async () => {
    const source = await mkdtemp(join(tmpdir(), 'seed-src-'));
    const id = await finishedExperiment(source);
    const gz = await exportSeed(prisma, source, [id]);
    const bundle = JSON.parse(gunzipSync(gz).toString('utf8'));
    // 6 events + 7 workspace files (one binary) + 1 fixture
    expect(Object.keys(bundle.files)).toHaveLength(14);
    expect(Object.values(bundle.files).filter((f) => String(f).startsWith('base64:'))).toHaveLength(
      1,
    );

    await reset(); // the sync recreates e1-skills as an empty draft with a new id
    const target = await mkdtemp(join(tmpdir(), 'seed-dst-'));
    const result = await loadSeed(prisma, target, gz);
    expect(result).toEqual({ loaded: ['e1-skills'], skipped: [], files: 14 });

    const e = await prisma.experiment.findUniqueOrThrow({
      where: { slug: 'e1-skills' },
      include: { trials: { include: { grades: true, manifest: true } }, tasks: true },
    });
    expect(e).toMatchObject({ id, status: 'completed', tasks: [{ position: 0 }] });
    expect(e.trials).toHaveLength(6);
    expect(e.trials[0]).toMatchObject({
      status: 'graded',
      grades: [{ graderId: 'report-exists' }],
      manifest: { json: { harborVersion: '0.24.0' } },
    });
    const t = e.trials.find((x) => x.repeatIndex === 0 && x.arm === 'B')!;
    expect(await readFile(join(target, t.workspacePath!, 'report.md'), 'utf8')).toMatch(/Report/);
    const binTrial = e.trials.find((x) => x.repeatIndex === 0 && x.arm === 'A')!;
    expect([...(await readFile(join(target, binTrial.workspacePath!, 'bin.dat')))]).toEqual([
      0, 1, 255,
    ]);

    // A second load is a no-op, and the next sync leaves the finished experiment alone.
    expect(await loadSeed(prisma, target, gz)).toBeNull();
    await new SyncService(prisma, repo).run();
    const after = await prisma.experiment.findUniqueOrThrow({ where: { slug: 'e1-skills' } });
    expect(after).toMatchObject({ id, status: 'completed' });
    expect(await prisma.trial.count({ where: { experimentId: id } })).toBe(6);
  });

  it('refuses to export a secret and skips experiments whose tasks are missing', async () => {
    const source = await mkdtemp(join(tmpdir(), 'seed-src-'));
    const id = await finishedExperiment(source);
    const trial = await prisma.trial.findFirstOrThrow({ where: { experimentId: id } });
    await put(
      source,
      `${trial.workspacePath}/leak.txt`,
      'key sk-ant-api03-abcdefghijklmnopqrstuvwxyz',
    );
    await expect(exportSeed(prisma, source, [id])).rejects.toThrow(SeedError);
    await writeFile(join(source, trial.workspacePath!, 'leak.txt'), 'token my-own-key-123');
    await expect(exportSeed(prisma, source, [id], ['my-own-key-123'])).rejects.toThrow(/API key/);

    await writeFile(join(source, trial.workspacePath!, 'leak.txt'), 'nothing here');
    const gz = await exportSeed(prisma, source, [id]);
    await prisma.$executeRawUnsafe('TRUNCATE "Task", "AgentConfig", "Experiment" CASCADE');
    const result = await loadSeed(prisma, await mkdtemp(join(tmpdir(), 'seed-dst-')), gz);
    expect(result).toMatchObject({ loaded: [], files: 0 });
    expect(result!.skipped[0]).toMatch(/e1-skills \(missing task csv-summary, config base/);
  });
});
