import { execFile } from 'node:child_process';
import { access, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import { ensureTrialMatrix, PrismaService } from '@evals/db';

/**
 * Fake-agent end-to-end test: the real compose stack (Postgres, migrate, containerized worker with
 * Harbor and the host Docker socket) runs the `e2e-fake` experiment from `e2e/repo` with
 * `FakeAgent`, the real task images and the real verifier image. Needs Docker and the images from
 * `pnpm images:build`; needs no API key.
 */
const run = promisify(execFile);
const ROOT = resolve(__dirname, '../../../..');
const PROJECT = 'agent-evals-e2e';
const DATABASE_URL = 'postgresql://evals:evals@localhost:55433/evals';
const DATA_DIR = join(ROOT, 'data', `e2e-${Date.now()}`);
const TERMINAL = new Set(['completed', 'failed', 'stopped_budget']);

function compose(...args: string[]): Promise<{ stdout: string; stderr: string }> {
  return run(
    'docker',
    [
      'compose',
      '-p',
      PROJECT,
      '-f',
      'docker-compose.yml',
      '-f',
      'e2e/docker-compose.e2e.yml',
      ...args,
    ],
    { cwd: ROOT, env: { ...process.env, EVALS_DATA_DIR: DATA_DIR }, maxBuffer: 64 * 1024 * 1024 },
  );
}

describe('fake-agent experiment end to end', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await compose('up', '-d', '--build', 'worker');
    prisma = new PrismaService(DATABASE_URL);
    await compose('run', '--rm', '--no-deps', '-T', 'api', 'node', 'dist/sync.cli');
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (process.env.E2E_KEEP) return;
    const logs = await compose('logs', '--no-color', 'worker').catch(() => null);
    if (logs) console.log(logs.stdout.split('\n').slice(-40).join('\n'));
    await compose('down', '-v');
    await rm(DATA_DIR, { recursive: true, force: true });
  });

  it('grades 2 tasks × 2 arms × 1 repeat', async () => {
    const experiment = await prisma.experiment.findUniqueOrThrow({ where: { slug: 'e2e-fake' } });
    expect(await ensureTrialMatrix(prisma, experiment.id)).toBe(4);
    await prisma.experiment.update({ where: { id: experiment.id }, data: { status: 'queued' } });

    let status = 'queued';
    for (const started = Date.now(); !TERMINAL.has(status); await sleep(2000)) {
      if (Date.now() - started > 10 * 60_000) throw new Error(`still ${status} after 10 minutes`);
      status = (await prisma.experiment.findUniqueOrThrow({ where: { id: experiment.id } })).status;
    }

    const done = await prisma.experiment.findUniqueOrThrow({ where: { id: experiment.id } });
    expect(done).toMatchObject({ status: 'completed', error: null });
    const trials = await prisma.trial.findMany({
      where: { experimentId: experiment.id },
      include: { task: true, grades: true, manifest: true },
    });
    expect(trials).toHaveLength(4);
    for (const trial of trials) {
      expect(trial).toMatchObject({
        status: 'graded',
        rewardValid: true,
        failureCause: null,
        score: 1,
        passed: true,
        gatePassed: true,
      });
      expect(trial.grades.length).toBeGreaterThan(0);
      expect(trial.manifest).not.toBeNull();
      await access(join(DATA_DIR, trial.workspacePath!));
    }
    expect(trials.map((t) => `${t.task.slug}/${t.arm}`).sort()).toEqual([
      'smoke-fake/A',
      'smoke-fake/B',
      'sum-fake/A',
      'sum-fake/B',
    ]);
  });
});
