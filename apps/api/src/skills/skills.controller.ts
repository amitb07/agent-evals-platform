import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  createSkillConfigSchema,
  slugSchema,
  type AgentConfig,
  type CreateSkillConfig,
  type SkillDetail,
  type SkillSummary,
} from '@evals/shared';
import { ZodValidationPipe } from '../common/zod.pipe';
import { SkillsService } from './skills.service';

@Controller()
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Get('skills')
  list(): Promise<SkillSummary[]> {
    return this.skills.list();
  }

  @Get('skills/:name')
  get(@Param('name', new ZodValidationPipe(slugSchema)) name: string): Promise<SkillDetail> {
    return this.skills.get(name);
  }

  /** A new config from a base config plus one skill (existing, or written in the request). */
  @Post('configs')
  createConfig(
    @Body(new ZodValidationPipe(createSkillConfigSchema)) body: CreateSkillConfig,
  ): Promise<AgentConfig> {
    return this.skills.createConfig(body);
  }
}
