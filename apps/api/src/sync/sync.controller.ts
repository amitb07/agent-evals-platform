import { BadRequestException, Controller, HttpCode, Post } from '@nestjs/common';
import { SyncError } from './sync.loader';
import { type SyncResult, SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post()
  @HttpCode(200)
  async run(): Promise<SyncResult> {
    try {
      return await this.sync.run();
    } catch (error) {
      if (error instanceof SyncError) {
        throw new BadRequestException({ error: 'Sync failed', details: error.issues });
      }
      throw error;
    }
  }
}
