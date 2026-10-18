import { Module } from '@nestjs/common';
import { env } from '../env';
import { SyncController } from './sync.controller';
import { REPO_DIR, SyncService } from './sync.service';

@Module({
  controllers: [SyncController],
  providers: [SyncService, { provide: REPO_DIR, useValue: env.REPO_DIR }],
  exports: [SyncService],
})
export class SyncModule {}
