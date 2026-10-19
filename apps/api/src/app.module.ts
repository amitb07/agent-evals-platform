import { Module } from '@nestjs/common';
import { PrismaModule } from '@evals/db';
import { ApiModule } from './api.module';
import { env } from './env';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [PrismaModule.forRoot(env.DATABASE_URL), SyncModule, ApiModule],
})
export class AppModule {}
