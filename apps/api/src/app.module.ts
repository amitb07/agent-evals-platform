import { Module } from '@nestjs/common';
import { PrismaModule } from '@evals/db';
import { env } from './env';

@Module({
  imports: [PrismaModule.forRoot(env.DATABASE_URL)],
})
export class AppModule {}
