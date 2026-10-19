import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  createExperimentSchema,
  trialsQuerySchema,
  type Experiment,
  type ExperimentDetail,
  type ExperimentStats,
  type ExperimentSummary,
  type TrialSummary,
  type TrialsQuery,
} from '@evals/shared';
import { ZodValidationPipe } from '../common/zod.pipe';
import { ExperimentsService } from './experiments.service';
import { StatsService } from './stats.service';

const uuid = new ParseUUIDPipe();

@Controller('experiments')
export class ExperimentsController {
  constructor(
    private readonly experiments: ExperimentsService,
    private readonly stats: StatsService,
  ) {}

  @Get()
  list(): Promise<ExperimentSummary[]> {
    return this.experiments.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createExperimentSchema)) body: Experiment,
  ): Promise<ExperimentDetail> {
    return this.experiments.create(body);
  }

  @Get(':id')
  get(@Param('id', uuid) id: string): Promise<ExperimentDetail> {
    return this.experiments.get(id);
  }

  @Post(':id/run')
  @HttpCode(200)
  run(@Param('id', uuid) id: string): Promise<ExperimentDetail> {
    return this.experiments.run(id);
  }

  @Post(':id/stop')
  @HttpCode(200)
  stop(@Param('id', uuid) id: string): Promise<ExperimentDetail> {
    return this.experiments.stop(id);
  }

  @Get(':id/stats')
  getStats(@Param('id', uuid) id: string): Promise<ExperimentStats> {
    return this.stats.get(id);
  }

  @Get(':id/trials')
  trials(
    @Param('id', uuid) id: string,
    @Query(new ZodValidationPipe(trialsQuerySchema)) query: TrialsQuery,
  ): Promise<TrialSummary[]> {
    return this.experiments.trials(id, query);
  }
}
