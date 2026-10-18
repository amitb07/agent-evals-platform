import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaService } from '@evals/db';
import { writeTree } from './compile/fs';
import type { WorkerEnv } from './env';
import { ExperimentRunner } from './experiment-runner.service';
import type { HarborHandle, HarborLaunch, HarborLauncher } from './harbor/process';
import { passingGrades, writeTrial, type FakeTrial } from './ingest/__fixtures__/trials';
import { IngestService } from './ingest/ingest.service';
import { PollerService } from './poller.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const DIGEST = `sha256:${'a'.repeat(64)}`;

/** A Harbor stand-in: writes the given trial dirs, then exits (or waits to be stopped). */
function fakeLauncher(
  trials: FakeTrial[],
  opts: { exitCode?: number; runUntilStopped?: boolean } = {},
) {
  const launches: HarborLaunch[] = [];
  const launcher: HarborLauncher = {
    launch(launch) {
      launches.push(launch);
      let finish!: (code: number | null) => void;
      const exited = new Promise<number | null>((resolve) => (finish = resolve));
      const trialsDir = join(launch.jobsDir, 'smoke-exp');
      void (async () => {
        for (const t of trials) await writeTrial(trialsDir, t);
        if (!opts.runUntilStopped) finish(opts.exitCode ?? 0);
      })();
      const handle: HarborHandle = {
        pid: 1,
        exited,
        stop: () => {
          finish(null);
          return exited.then(() => undefined);
        },
      };
      return handle;
    },
  };
  return { launcher, launches };
}

(databaseUrl ? describe : describe.skip)('ExperimentRunner (needs TEST_DATABASE_URL)', () => {
  let prisma: PrismaService;
  let env: WorkerEnv;

  beforeAll(() => {
    prisma = new PrismaService(databaseUrl!);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Task", "AgentConfig", "Experiment", "WorkerHeartbeat" CASCADE',
    );
    const repo = await mkdtemp(join(tmpdir(), 'evals-repo-'));
    await writeTree(repo, { 'skills/changelog-format/SKILL.md': '# skill\n' });
    env = {
      DATABASE_URL: databaseUrl!,
      DATA_DIR: await mkdtemp(join(tmpdir(), 'evals-data-')),
      REPO_DIR: repo,
      HERMES_IMAGE: 'evals/hermes-runner:test',
      VERIFIER_IMAGE: 'evals/verifier:test',
      ANTHROPIC_API_KEY: 'sk-test-secret',
      JUDGE_MODEL: 'claude-opus-5',
      HARBOR_BIN: 'false',
      HARBOR_RETRIES: 2,
      HARBOR_AGENT_IMPORT_PATH: 'hermes_harbor.hermes_agent:HermesAgent',
      POLL_INTERVAL_MS: 20,
    };
  });

  async function seedExperiment(costCapUsd = 10): Promise<string> {
    const config = (slug: string, skills: string[]) =>
      prisma.agentConfig.create({
        data: {
          slug,
          yamlHash: slug,
          name: slug,
          hermesImageDigest: DIGEST,
          model: 'claude-sonnet-5',
          provider: 'anthropic',
          skills,
          toolsets: ['terminal', 'file'],
          memory: { mode: 'off' },
          maxTurns: 20,
        },
      });
    const a = await config('base', []);
    const b = await config('base-skill', ['changelog-format']);
    const task = (slug: string) =>
      prisma.task.create({
        data: {
          slug,
          yamlHash: slug,
          title: slug,
          category: 'tools',
          prompt: 'Write hello.txt',
          fixtures: [],
          timeoutSec: 60,
          tags: [],
          graders: [
            { type: 'file_exists', id: 'hello', path: 'hello.txt', weight: 1, gate: false },
          ],
        },
      });
    const t1 = await task('hello');
    const t2 = await task('other');
    const experiment = await prisma.experiment.create({
      data: {
        slug: 'smoke-exp',
        name: 'Smoke',
        hypothesis: 'h',
        factor: 'skills',
        repeats: 2,
        concurrency: 2,
        passThreshold: 0.8,
        costCapUsd,
        seed: 1,
        heldOutTaskIds: [],
        baselineConfigId: a.id,
        candidateConfigId: b.id,
        status: 'queued',
        tasks: {
          create: [
            { taskId: t1.id, position: 0 },
            { taskId: t2.id, position: 1 },
          ],
        },
      },
    });
    return experiment.id;
  }

  const runnerWith = (launcher: HarborLauncher) =>
    new ExperimentRunner(prisma, new IngestService(prisma, env), env, launcher);

  const allTrials: FakeTrial[] = [
    { name: 'hello__a1', taskSlug: 'hello', arm: 'A', grades: passingGrades(1) },
    {
      name: 'hello__a2',
      taskSlug: 'hello',
      arm: 'A',
      exception: 'AgentTimeoutError',
      grades: passingGrades(0),
    },
    { name: 'hello__b1', taskSlug: 'hello', arm: 'B', grades: passingGrades(1) },
    { name: 'hello__b2', taskSlug: 'hello', arm: 'B', grades: null },
    {
      name: 'other__a1',
      taskSlug: 'other',
      arm: 'A',
      exception: 'ApiRateLimitError',
      grades: null,
    },
    { name: 'other__a2', taskSlug: 'other', arm: 'A' },
    { name: 'other__b1', taskSlug: 'other', arm: 'B' },
    {
      name: 'other__b2',
      taskSlug: 'other',
      arm: 'B',
      files: { 'verifier/grades.json': 'not json' },
    },
  ];

  it('runs a claimed experiment end to end and ingests every trial', async () => {
    const id = await seedExperiment();
    const { launcher, launches } = fakeLauncher(allTrials);
    const poller = new PollerService(prisma, runnerWith(launcher), env);
    expect(await poller.tick()).toBe(id);

    expect(launches[0]).toMatchObject({ jobsDir: join(env.DATA_DIR, 'jobs', id) });
    expect(launches[0]!.env.PYTHONPATH).toContain(env.REPO_DIR);
    expect(await prisma.experiment.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: 'completed',
      error: null,
      harborJobName: 'smoke-exp',
    });

    const trials = await prisma.trial.findMany({
      where: { experimentId: id },
      include: { task: true, grades: true, manifest: true },
      orderBy: [{ harborTrialName: 'asc' }],
    });
    expect(trials).toHaveLength(8);
    const byName = Object.fromEntries(trials.map((t) => [t.harborTrialName ?? '', t]));
    expect(byName['hello__a1']).toMatchObject({
      status: 'graded',
      score: 1,
      passed: true,
      rewardValid: true,
      arm: 'A',
      repeatIndex: 0,
      costUsd: 0.01,
    });
    expect(byName['hello__a1']!.grades).toHaveLength(1);
    expect(byName['hello__a1']!.manifest!.json).toMatchObject({
      configs: { B: { slug: 'base-skill' } },
      trial: { arm: 'A', configSlug: 'base' },
    });
    expect(byName['hello__a2']).toMatchObject({
      status: 'graded',
      failureCause: 'agent_exhausted_budget',
      rewardValid: true,
      score: 0,
      repeatIndex: 1,
    });
    expect(byName['hello__b2']).toMatchObject({
      status: 'failed',
      failureCause: 'verifier_failed',
      rewardValid: false,
      score: null,
    });
    expect(byName['other__a1']).toMatchObject({
      status: 'failed',
      failureCause: 'model_provider_failed',
      rewardValid: false,
    });
    expect(byName['other__b2']).toMatchObject({ status: 'ingest_failed', arm: 'B' });
    expect(trials.every((t) => t.status !== 'pending')).toBe(true);
  });

  it('redacts the API key from stored trial files', async () => {
    const id = await seedExperiment();
    await runnerWith(fakeLauncher(allTrials.slice(0, 1)).launcher).run(id);
    const trial = await prisma.trial.findFirstOrThrow({ where: { harborTrialName: 'hello__a1' } });
    const { readFile } = await import('node:fs/promises');
    expect(await readFile(join(env.DATA_DIR, trial.stderrPath!), 'utf8')).toBe('key=[REDACTED]\n');
  });

  it('stops Harbor when the cost cap is reached and leaves the rest pending', async () => {
    const id = await seedExperiment(0.015);
    const { launcher } = fakeLauncher(
      allTrials.slice(0, 2).map((t) => ({ ...t, costUsd: 0.01 })),
      { runUntilStopped: true },
    );
    expect(await runnerWith(launcher).run(id)).toBe('stopped_budget');
    expect(await prisma.trial.count({ where: { experimentId: id, status: 'pending' } })).toBe(6);
  });

  it('stops on user request', async () => {
    const id = await seedExperiment();
    await prisma.experiment.update({ where: { id }, data: { stopRequested: true } });
    const { launcher } = fakeLauncher([], { runUntilStopped: true });
    expect(await runnerWith(launcher).run(id)).toBe('completed');
    expect(await prisma.experiment.findUniqueOrThrow({ where: { id } })).toMatchObject({
      error: 'stopped by user',
    });
  });

  it('fails the experiment when Harbor exits non-zero with nothing ingested', async () => {
    const id = await seedExperiment();
    expect(await runnerWith(fakeLauncher([], { exitCode: 2 }).launcher).run(id)).toBe('failed');
    expect((await prisma.experiment.findUniqueOrThrow({ where: { id } })).error).toMatch(
      /Harbor exited with 2/,
    );
  });

  it('fails the experiment when Harbor cannot be started', async () => {
    const id = await seedExperiment();
    const launcher: HarborLauncher = {
      launch: () => ({
        pid: undefined,
        exited: Promise.reject(new Error('spawn harbor ENOENT')),
        stop: () => Promise.resolve(),
      }),
    };
    expect(await runnerWith(launcher).run(id)).toBe('failed');
    expect((await prisma.experiment.findUniqueOrThrow({ where: { id } })).error).toMatch(/ENOENT/);
  });

  it('claims only queued experiments and fails orphans at startup', async () => {
    const id = await seedExperiment();
    const poller = new PollerService(prisma, runnerWith(fakeLauncher([]).launcher), env);
    await prisma.experiment.update({ where: { id }, data: { status: 'draft' } });
    expect(await poller.claim()).toBeNull();
    await prisma.experiment.update({ where: { id }, data: { status: 'running' } });
    await poller.onApplicationBootstrap();
    await poller.onApplicationShutdown();
    expect(await prisma.experiment.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: 'failed',
    });
    expect(await prisma.workerHeartbeat.count()).toBe(1);
  });
});
