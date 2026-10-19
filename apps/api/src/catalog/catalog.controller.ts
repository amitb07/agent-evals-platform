import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from '@evals/db';
import type { AgentConfig, ConfigSummary, Task, TaskSummary } from '@evals/shared';
import { toAgentConfig, toConfigSummary, toTask, toTaskSummary } from '../common/mappers';

@Controller()
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('tasks')
  async tasks(): Promise<TaskSummary[]> {
    return (await this.prisma.task.findMany({ orderBy: { slug: 'asc' } })).map(toTaskSummary);
  }

  @Get('tasks/:slug')
  async task(@Param('slug') slug: string): Promise<Task> {
    const row = await this.prisma.task.findUnique({ where: { slug } });
    if (!row) throw new NotFoundException(`Task ${slug} not found`);
    return toTask(row);
  }

  @Get('configs')
  async configs(): Promise<ConfigSummary[]> {
    return (await this.prisma.agentConfig.findMany({ orderBy: { slug: 'asc' } })).map(
      toConfigSummary,
    );
  }

  @Get('configs/:slug')
  async config(@Param('slug') slug: string): Promise<AgentConfig> {
    const row = await this.prisma.agentConfig.findUnique({ where: { slug } });
    if (!row) throw new NotFoundException(`Config ${slug} not found`);
    return toAgentConfig(row);
  }
}
