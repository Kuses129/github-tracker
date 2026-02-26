import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ErrorResponse } from './models/error-response.model';
import type { AppConfig } from '../../config/config.schema';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly headerName: string;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService<AppConfig>,
  ) {
    this.headerName = this.configService.get<string>('CORRELATION_ID_HEADER') ?? 'x-correlation-id';
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<FastifyRequest>();
    const response = ctx.getResponse<FastifyReply>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? this.resolveMessage(exception)
        : 'Internal server error';

    const correlationId =
      (response.getHeader(this.headerName) as string) ?? '';

    const body: ErrorResponse = {
      statusCode,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(statusCode).send(body);
  }

  private resolveMessage(exception: HttpException): string {
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return response;
    }

    if (typeof response === 'object' && response !== null) {
      const obj = response as Record<string, unknown>;
      if (typeof obj['message'] === 'string') {
        return obj['message'];
      }
      if (Array.isArray(obj['message'])) {
        return (obj['message'] as string[]).join(', ');
      }
    }

    return exception.message;
  }
}
