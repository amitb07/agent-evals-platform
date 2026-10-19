/**
 * Writes the demo seed (plan §14.1) from finished experiments in the database.
 *
 * Usage: pnpm seed:export <experiment slug or id> ...   → seed/demo.json.gz
 * Runs against DATABASE_URL and DATA_DIR (the compose stack: see the README).
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '@evals/db';
import { AppModule } from './app.module';
import { env } from './env';
import { exportSeed } from './seed/seed-bundle';
import { SEED_FILE } from './seed/seed.service';

async function main(): Promise<void> {
  const refs = process.argv.slice(2);
  if (refs.length === 0) throw new Error('usage: seed:export <experiment slug or id> ...');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const prisma = app.get(PrismaService);
    const ids: string[] = [];
    for (const ref of refs) {
      const e = await prisma.experiment.findFirst({
        where: /^[0-9a-f-]{36}$/.test(ref) ? { id: ref } : { slug: ref },
        select: { id: true },
      });
      if (!e) throw new Error(`Experiment ${ref} not found`);
      ids.push(e.id);
    }
    const gz = await exportSeed(prisma, env.DATA_DIR, ids, [env.ANTHROPIC_API_KEY ?? '']);
    const out = join(env.REPO_DIR, SEED_FILE);
    await writeFile(out, gz);
    new Logger('Seed').log(`Wrote ${out} (${(gz.length / 1024).toFixed(0)} kB)`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  new Logger('Seed').error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
