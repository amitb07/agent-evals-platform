import { Module } from '@nestjs/common';
import { PrismaModule } from '@evals/db';
import { env } from './env';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [PrismaModule.forRoot(env.DATABASE_URL), SyncModule],
})
export class AppModule {}
