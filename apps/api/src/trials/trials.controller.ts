import { Controller, Get, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import type { TrialDetail, TrialDiff, TrialFile } from '@evals/shared';
import type { Response } from 'express';
import { TrialsService } from './trials.service';

const uuid = new ParseUUIDPipe();

@Controller('trials')
export class TrialsController {
  constructor(private readonly trials: TrialsService) {}

  @Get(':id')
  get(@Param('id', uuid) id: string): Promise<TrialDetail> {
    return this.trials.get(id);
  }

  @Get(':id/events')
  events(@Param('id', uuid) id: string): Promise<unknown[]> {
    return this.trials.events(id);
  }

  @Get(':id/session')
  session(@Param('id', uuid) id: string): Promise<unknown[]> {
    return this.trials.session(id);
  }

  @Get(':id/diff')
  async diff(@Param('id', uuid) id: string): Promise<TrialDiff> {
    return { diff: await this.trials.diff(id) };
  }

  @Get(':id/files')
  files(@Param('id', uuid) id: string): Promise<TrialFile[]> {
    return this.trials.files(id);
  }

  /** Workspace files are served as plain text or bytes, never rendered as HTML. */
  @Get(':id/files/*path')
  async file(
    @Param('id', uuid) id: string,
    @Param('path') path: string | string[],
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.trials.file(id, Array.isArray(path) ? path.join('/') : path);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.type(
      /\.(md|txt|csv|json|jsonl|ya?ml|py|js|ts|sh|toml|html?)$/i.test(file)
        ? 'text/plain'
        : 'application/octet-stream',
    );
    res.sendFile(file);
  }
}
