import { Module } from '@nestjs/common';
import { CatalogController } from './catalog/catalog.controller';
import { API_ENV } from './config';
import { env } from './env';
import { ExperimentsController } from './experiments/experiments.controller';
import { ExperimentsService } from './experiments/experiments.service';
import { StatsService } from './experiments/stats.service';
import { HealthController } from './health/health.controller';
import { TrialsController } from './trials/trials.controller';
import { TrialsService } from './trials/trials.service';

@Module({
  controllers: [CatalogController, ExperimentsController, TrialsController, HealthController],
  providers: [{ provide: API_ENV, useValue: env }, ExperimentsService, StatsService, TrialsService],
})
export class ApiModule {}
