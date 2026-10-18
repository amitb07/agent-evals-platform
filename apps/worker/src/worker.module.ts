import { Module } from '@nestjs/common';
import { PrismaModule } from '@evals/db';
import { envSchema, WORKER_ENV } from './env';
import { ExperimentRunner, HARBOR_LAUNCHER } from './experiment-runner.service';
import { spawnHarbor } from './harbor/process';
import { IngestService } from './ingest/ingest.service';
import { PollerService } from './poller.service';

const env = envSchema.parse(process.env);

@Module({
  imports: [PrismaModule.forRoot(env.DATABASE_URL)],
  providers: [
    { provide: WORKER_ENV, useValue: env },
    { provide: HARBOR_LAUNCHER, useValue: spawnHarbor },
    IngestService,
    ExperimentRunner,
    PollerService,
  ],
})
export class WorkerModule {}
