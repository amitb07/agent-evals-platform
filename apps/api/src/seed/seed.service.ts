import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@evals/db';
import { API_ENV, type ApiEnv } from '../config';
import { REPO_DIR } from '../sync/sync.service';
import { loadSeed } from './seed-bundle';

/** Committed demo seed, relative to the repo. */
export const SEED_FILE = 'seed/demo.json.gz';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REPO_DIR) private readonly repoDir: string,
    @Inject(API_ENV) private readonly env: Pick<ApiEnv, 'DATA_DIR' | 'DEMO_SEED'>,
  ) {}

  /** Loads the demo experiments into an empty database (no trials yet). Runs after the YAML sync. */
  async loadIfEmpty(): Promise<void> {
    if (!this.env.DEMO_SEED) return;
    let gz: Buffer;
    try {
      gz = await readFile(join(this.repoDir, SEED_FILE));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    const result = await loadSeed(this.prisma, this.env.DATA_DIR, gz);
    if (!result) return;
    if (result.loaded.length) {
      this.logger.log(
        `Demo seed loaded: ${result.loaded.join(', ')} (${result.files} files written)`,
      );
    }
    for (const skipped of result.skipped) this.logger.warn(`Demo seed skipped ${skipped}`);
  }
}
