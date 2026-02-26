import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppConfig } from '../../config/config.schema';

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  private readonly headerName: string;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService<AppConfig>,
  ) {
    this.headerName = this.configService.get<string>('CORRELATION_ID_HEADER') ?? 'x-correlation-id';
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const response = http.getResponse<FastifyReply>();

    const correlationId =
      (request.headers[this.headerName] as string) ?? uuidv4();

    response.header(this.headerName, correlationId);

    return next.handle();
  }
}
