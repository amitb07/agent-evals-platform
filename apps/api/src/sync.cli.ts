import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SyncService } from './sync/sync.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    await app.get(SyncService).run();
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  new Logger('Sync').error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
