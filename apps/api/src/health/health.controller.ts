import { access, constants } from 'node:fs/promises';
import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { PrismaService } from '@evals/db';
import type { Health } from '@evals/shared';
import type { Response } from 'express';
import { API_ENV, type ApiEnv } from '../config';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: Pick<ApiEnv, 'DATA_DIR'>,
  ) {}

  /** 200 when the database answers, else 503; the body always has every field. */
  @Get()
  async health(@Res({ passthrough: true }) res: Response): Promise<Health> {
    const [heartbeat, dataDirWritable] = await Promise.all([
      this.prisma.workerHeartbeat
        .findFirst({ orderBy: { updatedAt: 'desc' } })
        .then((h) => ({ ok: true, at: h?.updatedAt ?? null }))
        .catch(() => ({ ok: false, at: null })),
      access(this.env.DATA_DIR, constants.W_OK).then(
        () => true,
        () => false,
      ),
    ]);
    if (!heartbeat.ok) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      db: heartbeat.ok,
      dataDirWritable,
      workerHeartbeatAgeSec: heartbeat.at ? (Date.now() - heartbeat.at.getTime()) / 1000 : null,
    };
  }
}
