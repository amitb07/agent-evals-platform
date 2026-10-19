import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaModule, PrismaService } from '@evals/db';
import request from 'supertest';
import type { App } from 'supertest/types';
import { CatalogController } from './catalog/catalog.controller';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { API_ENV, type ApiEnv } from './config';
import { ExperimentsController } from './experiments/experiments.controller';
import { ExperimentsService } from './experiments/experiments.service';
import { StatsService } from './experiments/stats.service';
import { HealthController } from './health/health.controller';
import { VALID_REPO, writeRepo } from './sync/__fixtures__/repo';
import { SyncService } from './sync/sync.service';
import { TrialsController } from './trials/trials.controller';
import { TrialsService } from './trials/trials.service';

const databaseUrl = process.env.TEST_DATABASE_URL;

const SECOND_TASK = `id: sum-numbers
title: Sum numbers
category: coding
prompt: Write sum.txt.
timeoutSec: 60
graders:
  - { type: file_exists, id: sum-exists, path: sum.txt, weight: 1 }
`;

const MODEL_CONFIG = VALID_REPO['configs/base.yaml']!.replace('id: base', 'id: base-opus')
  .replace('name: base', 'name: base-opus')
  .replace('claude-sonnet-5', 'claude-opus-5');

const draft = {
  id: 'ui-skills',
  name: 'From the UI',
  hypothesis: 'The skill helps.',
  factor: 'skills',
  taskIds: ['csv-summary', 'sum-numbers'],
  baselineConfigId: 'base',
  candidateConfigId: 'base-skill',
  repeats: 2,
  costCapUsd: 5,
  seed: 7,
  heldOutTaskIds: ['sum-numbers'],
};

(databaseUrl ? describe : describe.skip)('API (needs TEST_DATABASE_URL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let env: Pick<ApiEnv, 'ANTHROPIC_API_KEY' | 'DATA_DIR'>;
  let http: () => request.Agent;

  beforeAll(async () => {
    env = { ANTHROPIC_API_KEY: 'sk-test', DATA_DIR: await mkdtemp(join(tmpdir(), 'evals-data-')) };
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule.forRoot(databaseUrl!)],
      controllers: [CatalogController, ExperimentsController, TrialsController, HealthController],
      providers: [
        { provide: API_ENV, useValue: env },
        ExperimentsService,
        StatsService,
        TrialsService,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    http = () => request(app.getHttpServer());
  });

  beforeEach(async () => {
    env.ANTHROPIC_API_KEY = 'sk-test';
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Task", "AgentConfig", "Experiment", "WorkerHeartbeat" CASCADE',
    );
    const repo = await writeRepo({
      ...VALID_REPO,
      'tasks/sum-numbers/task.yaml': SECOND_TASK,
      'configs/base-opus.yaml': MODEL_CONFIG,
    });
    await new SyncService(prisma, repo).run();
  });

  afterAll(async () => {
    await app.close();
  });

  const create = async () => {
    const res = await http().post('/api/v1/experiments').send(draft).expect(201);
    return res.body as { id: string };
  };

  it('lists tasks and configs', async () => {
    const tasks = await http().get('/api/v1/tasks').expect(200);
    expect(tasks.body).toEqual([
      { slug: 'csv-summary', title: 'CSV summary', category: 'tools', graderCount: 1 },
      { slug: 'sum-numbers', title: 'Sum numbers', category: 'coding', graderCount: 1 },
    ]);
    const task = await http().get('/api/v1/tasks/csv-summary').expect(200);
    expect(task.body).toMatchObject({ id: 'csv-summary', fixtures: ['data/sales.csv'] });
    const config = await http().get('/api/v1/configs/base-skill').expect(200);
    expect(config.body).toMatchObject({ skills: ['changelog-format'], memory: { mode: 'off' } });
    expect((await http().get('/api/v1/configs').expect(200)).body).toHaveLength(3);
    expect((await http().get('/api/v1/tasks/nope').expect(404)).body).toEqual({
      error: 'Task nope not found',
    });
  });

  it('creates a draft and validates the body, references and factor', async () => {
    const created = await http().post('/api/v1/experiments').send(draft).expect(201);
    expect(created.body).toMatchObject({
      slug: 'ui-skills',
      status: 'draft',
      concurrency: 4,
      passThreshold: 0.8,
      progress: { done: 0, total: 8 },
      tasks: [{ taskSlug: 'csv-summary' }, { taskSlug: 'sum-numbers', category: 'coding' }],
    });
    await http().post('/api/v1/experiments').send(draft).expect(409);

    const invalid = await http()
      .post('/api/v1/experiments')
      .send({ ...draft, id: 'Bad Slug', repeats: 0 })
      .expect(400);
    expect(invalid.body.error).toBe('Validation failed');
    const details = invalid.body.details as { path: string }[];
    expect(details.map((d) => d.path)).toEqual(['id', 'repeats']);

    const refs = await http()
      .post('/api/v1/experiments')
      .send({
        ...draft,
        id: 'x',
        taskIds: ['nope'],
        heldOutTaskIds: [],
        candidateConfigId: 'base-opus',
      })
      .expect(400);
    expect(refs.body.details).toEqual([
      'Unknown task nope',
      'Configs must differ only in skills; they differ in: model',
    ]);
  });

  it('runs a draft once, creates the trial matrix and lists it', async () => {
    const { id } = await create();
    await http().get(`/api/v1/experiments/not-a-uuid`).expect(400);

    env.ANTHROPIC_API_KEY = '';
    expect((await http().post(`/api/v1/experiments/${id}/run`).expect(400)).body.error).toMatch(
      /ANTHROPIC_API_KEY/,
    );
    env.ANTHROPIC_API_KEY = 'sk-test';

    const run = await http().post(`/api/v1/experiments/${id}/run`).expect(200);
    expect(run.body).toMatchObject({ status: 'queued', progress: { done: 0, total: 8 } });
    expect(await prisma.trial.count({ where: { experimentId: id, status: 'pending' } })).toBe(8);
    await http().post(`/api/v1/experiments/${id}/run`).expect(409);

    const trials = await http().get(`/api/v1/experiments/${id}/trials?arm=B`).expect(200);
    expect(trials.body).toHaveLength(4);
    expect(trials.body[0]).toMatchObject({ taskSlug: 'csv-summary', arm: 'B', repeatIndex: 0 });
    await http().get(`/api/v1/experiments/${id}/trials?arm=C`).expect(400);
  });

  it('stops a queued experiment back to draft and flags a running one', async () => {
    const { id } = await create();
    await http().post(`/api/v1/experiments/${id}/stop`).expect(409);
    await http().post(`/api/v1/experiments/${id}/run`).expect(200);

    const unqueued = await http().post(`/api/v1/experiments/${id}/stop`).expect(200);
    expect(unqueued.body).toMatchObject({ status: 'draft', stopRequested: false });
    expect(await prisma.trial.count({ where: { experimentId: id } })).toBe(0);

    await http().post(`/api/v1/experiments/${id}/run`).expect(200);
    await prisma.experiment.update({ where: { id }, data: { status: 'running' } });
    const stopping = await http().post(`/api/v1/experiments/${id}/stop`).expect(200);
    expect(stopping.body).toMatchObject({ status: 'running', stopRequested: true });
  });

  it('reports progress, spend, per-arm summaries and cached stats', async () => {
    const { id } = await create();
    await http().post(`/api/v1/experiments/${id}/run`).expect(200);
    const rows = await prisma.trial.findMany({
      where: { experimentId: id },
      include: { task: true },
    });
    for (const [i, t] of rows.entries()) {
      if (t.task.slug === 'sum-numbers' && t.arm === 'B' && t.repeatIndex === 1) continue;
      const score = t.arm === 'B' ? 1 : 0.5;
      await prisma.trial.update({
        where: { id: t.id },
        data: {
          harborTrialName: `trial-${i}`,
          status: 'graded',
          rewardValid: true,
          score,
          passed: score >= 0.8,
          gatePassed: true,
          costUsd: 0.01,
        },
      });
    }

    const list = await http().get('/api/v1/experiments').expect(200);
    expect(list.body[0]).toMatchObject({ id, progress: { done: 7, total: 8 } });
    expect(list.body[0].spendUsd).toBeCloseTo(0.07);

    const detail = await http().get(`/api/v1/experiments/${id}`).expect(200);
    expect(detail.body.tasks[1]).toMatchObject({
      taskSlug: 'sum-numbers',
      A: { trials: 2, valid: 2, passes: 0, meanScore: 0.5 },
      B: { trials: 2, valid: 1, passes: 1, meanScore: 1 },
    });

    const stats = await http().get(`/api/v1/experiments/${id}/stats`).expect(200);
    expect(stats.body).toMatchObject({
      effect: 0.5,
      verdict: 'inconclusive',
      nTasks: 2,
      k: 2,
      seed: 7,
      tasks: [
        { taskSlug: 'csv-summary', heldOut: false },
        { taskSlug: 'sum-numbers', heldOut: true, nB: 1 },
      ],
      arms: { A: { finished: 4, passAt1: 0 }, B: { finished: 3, passAt1: 1 } },
    });
    expect(stats.body.verdictNote).toMatch(/at least 6/);

    // Served from the snapshot until another trial is ingested.
    const again = await http().get(`/api/v1/experiments/${id}/stats`).expect(200);
    expect(again.body.computedAt).toBe(stats.body.computedAt);
    const last = rows.find(
      (t) => t.task.slug === 'sum-numbers' && t.arm === 'B' && t.repeatIndex === 1,
    )!;
    await prisma.trial.update({
      where: { id: last.id },
      data: { harborTrialName: 'trial-last', status: 'failed', failureCause: 'sandbox_failed' },
    });
    const fresh = await http().get(`/api/v1/experiments/${id}/stats`).expect(200);
    expect(fresh.body.arms.B).toMatchObject({
      finished: 4,
      excluded: 1,
      failures: { sandbox_failed: 1 },
    });
  });

  it('serves trial detail, events, diff and workspace files without leaving the workspace', async () => {
    const { id } = await create();
    await http().post(`/api/v1/experiments/${id}/run`).expect(200);
    const trial = await prisma.trial.findFirstOrThrow({
      where: { experimentId: id, arm: 'A', task: { slug: 'csv-summary' } },
    });
    const files: Record<string, string> = {
      [`harbor-tasks/${id}/csv-summary/environment/fixtures/data/sales.csv`]: 'region,revenue\n',
      [`trials/${trial.id}/workspace/data/sales.csv`]: 'region,revenue\n',
      [`trials/${trial.id}/workspace/report.md`]: '# Report\n',
      [`trials/${trial.id}/agent/events.jsonl`]: '{"type":"text","text":"hi"}\n',
      'secret.txt': 'do not serve',
    };
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(env.DATA_DIR, path)), { recursive: true });
      await writeFile(join(env.DATA_DIR, path), content);
    }
    await prisma.trial.update({
      where: { id: trial.id },
      data: {
        harborTrialName: 't1',
        status: 'graded',
        rewardValid: true,
        score: 1,
        workspacePath: `trials/${trial.id}/workspace`,
        eventsPath: `trials/${trial.id}/agent/events.jsonl`,
        grades: {
          create: {
            graderId: 'report-exists',
            type: 'file_exists',
            score: 1,
            passed: true,
            gate: false,
            reason: 'exists',
            evidence: ['report.md'],
          },
        },
        manifest: { create: { json: { harborVersion: '0.24.0' } } },
      },
    });

    const detail = await http().get(`/api/v1/trials/${trial.id}`).expect(200);
    expect(detail.body).toMatchObject({
      taskSlug: 'csv-summary',
      configSlug: 'base',
      prompt: expect.any(String),
      grades: [{ graderId: 'report-exists', evidence: ['report.md'] }],
      manifest: { harborVersion: '0.24.0' },
    });
    expect((await http().get(`/api/v1/trials/${trial.id}/events`).expect(200)).body).toEqual([
      { type: 'text', text: 'hi' },
    ]);
    expect((await http().get(`/api/v1/trials/${trial.id}/session`).expect(404)).body.error).toMatch(
      /no session/,
    );
    const diff = await http().get(`/api/v1/trials/${trial.id}/diff`).expect(200);
    expect(diff.body.diff).toBe(
      'diff a/report.md b/report.md\n--- /dev/null\n+++ b/report.md\n@@ -0,0 +1,1 @@\n+# Report\n',
    );
    expect((await http().get(`/api/v1/trials/${trial.id}/files`).expect(200)).body).toEqual([
      { path: 'data/sales.csv', size: 15 },
      { path: 'report.md', size: 9 },
    ]);
    const file = await http().get(`/api/v1/trials/${trial.id}/files/report.md`).expect(200);
    expect(file.text).toBe('# Report\n');
    expect(file.headers['content-type']).toMatch(/^text\/plain/);
    await http().get(`/api/v1/trials/${trial.id}/files/missing.md`).expect(404);
    await http().get(`/api/v1/trials/${trial.id}/files/..%2F..%2F..%2Fsecret.txt`).expect(400);
  });

  it('reports health', async () => {
    const empty = await http().get('/api/v1/health').expect(200);
    expect(empty.body).toEqual({ db: true, dataDirWritable: true, workerHeartbeatAgeSec: null });
    await prisma.workerHeartbeat.create({ data: { id: 'worker' } });
    const beat = await http().get('/api/v1/health').expect(200);
    expect(beat.body.workerHeartbeatAgeSec).toBeLessThan(5);
  });
});
