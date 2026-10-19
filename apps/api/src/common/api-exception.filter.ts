import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiError } from '@evals/shared';
import type { Response } from 'express';

/** Every error response is `{ error, details? }`. Unexpected errors are logged and hidden. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json(toApiError(exception));
      return;
    }
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: 'Internal server error' } satisfies ApiError);
  }
}

function toApiError(exception: HttpException): ApiError {
  const body = exception.getResponse();
  if (typeof body === 'object' && body !== null && 'error' in body && 'details' in body) {
    return { error: String(body.error), details: body.details };
  }
  return { error: exception.message };
}
