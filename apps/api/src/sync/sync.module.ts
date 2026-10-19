import { Module } from '@nestjs/common';
import { API_ENV } from '../config';
import { env } from '../env';
import { SeedService } from '../seed/seed.service';
import { SyncController } from './sync.controller';
import { REPO_DIR, SyncService } from './sync.service';

@Module({
  controllers: [SyncController],
  providers: [
    SyncService,
    SeedService,
    { provide: REPO_DIR, useValue: env.REPO_DIR },
    { provide: API_ENV, useValue: env },
  ],
  exports: [SyncService, SeedService],
})
export class SyncModule {}
