import { PrismaService } from '@evals/db';
import { EXPERIMENT_YAML, TASK_YAML, VALID_REPO, writeRepo } from './__fixtures__/repo';
import { SyncError } from './sync.loader';
import { SyncService } from './sync.service';

const databaseUrl = process.env.TEST_DATABASE_URL;

(databaseUrl ? describe : describe.skip)('SyncService (needs TEST_DATABASE_URL)', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    prisma = new PrismaService(databaseUrl!);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "Task", "AgentConfig", "Experiment" CASCADE');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates, skips unchanged and updates by hash', async () => {
    const dir = await writeRepo(VALID_REPO);
    const sync = new SyncService(prisma, dir);

    expect(await sync.run()).toEqual({
      tasks: { created: 1, updated: 0, unchanged: 0 },
      configs: { created: 2, updated: 0, unchanged: 0 },
      experiments: { created: 1, updated: 0, unchanged: 0, locked: [] },
    });
    expect((await sync.run()).tasks).toEqual({ created: 0, updated: 0, unchanged: 1 });

    await writeRepo(
      { 'tasks/csv-summary/task.yaml': TASK_YAML.replace('CSV summary', 'Sales') },
      dir,
    );
    expect((await sync.run()).tasks).toEqual({ created: 0, updated: 1, unchanged: 0 });

    const experiment = await prisma.experiment.findUniqueOrThrow({
      where: { slug: 'e1-skills' },
      include: { tasks: { include: { task: true } }, baselineConfig: true, candidateConfig: true },
    });
    expect(experiment).toMatchObject({
      status: 'draft',
      baselineConfig: { slug: 'base' },
      candidateConfig: { slug: 'base-skill', skills: ['changelog-format'] },
      tasks: [{ position: 0, task: { slug: 'csv-summary', title: 'Sales' } }],
    });
  });

  it('updates draft experiments and locks experiments that have run', async () => {
    const dir = await writeRepo(VALID_REPO);
    const sync = new SyncService(prisma, dir);
    await sync.run();

    await writeRepo(
      { 'experiments/e1-skills.yaml': EXPERIMENT_YAML.replace('seed: 1', 'seed: 2') },
      dir,
    );
    expect((await sync.run()).experiments).toMatchObject({ updated: 1, locked: [] });

    await prisma.experiment.update({ where: { slug: 'e1-skills' }, data: { status: 'completed' } });
    await writeRepo(
      { 'experiments/e1-skills.yaml': EXPERIMENT_YAML.replace('seed: 1', 'seed: 3') },
      dir,
    );
    expect((await sync.run()).experiments).toMatchObject({ updated: 0, locked: ['e1-skills'] });
    expect(
      await prisma.experiment.findUniqueOrThrow({ where: { slug: 'e1-skills' } }),
    ).toMatchObject({ seed: 2 });
  });

  it('writes nothing when the repository is invalid', async () => {
    const dir = await writeRepo({ ...VALID_REPO, 'configs/bad.yaml': 'id: [' });
    await expect(new SyncService(prisma, dir).run()).rejects.toBeInstanceOf(SyncError);
    expect(await prisma.task.count()).toBe(0);
  });
});
