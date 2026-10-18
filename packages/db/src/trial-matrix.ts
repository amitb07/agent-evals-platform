import type { Prisma } from './generated/prisma/client';

type Db = Pick<Prisma.TransactionClient, 'experiment' | 'trial'>;

/**
 * Creates the `pending` Trial rows for an experiment: tasks × {A, B} × repeats. Idempotent, so the
 * API (when queueing) and the worker (when claiming) can both call it. Returns the matrix size.
 */
export async function ensureTrialMatrix(db: Db, experimentId: string): Promise<number> {
  const experiment = await db.experiment.findUniqueOrThrow({
    where: { id: experimentId },
    include: { tasks: { orderBy: { position: 'asc' } } },
  });
  const rows: Prisma.TrialCreateManyInput[] = [];
  for (const { taskId } of experiment.tasks) {
    for (const [arm, configId] of [
      ['A', experiment.baselineConfigId],
      ['B', experiment.candidateConfigId],
    ] as const) {
      for (let repeatIndex = 0; repeatIndex < experiment.repeats; repeatIndex++) {
        rows.push({ experimentId, taskId, configId, arm, repeatIndex });
      }
    }
  }
  await db.trial.createMany({ data: rows, skipDuplicates: true });
  return rows.length;
}
