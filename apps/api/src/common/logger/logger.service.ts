import type { LoggerService as NestLoggerService } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';
import { buildWinstonTransports } from './logger.factory';
import type { AppConfig } from '../../config/config.schema';

@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly logger: winston.Logger;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    const nodeEnv = this.configService.get<string>('NODE_ENV') ?? 'development';

    this.logger = winston.createLogger({
      level: nodeEnv === 'production' ? 'info' : 'debug',
      transports: buildWinstonTransports(nodeEnv),
    });
  }

  log(message: string, context?: string, meta?: Record<string, unknown>) {
    this.logger.info({ message, context, ...meta });
  }

  warn(message: string, context?: string, meta?: Record<string, unknown>) {
    this.logger.warn({ message, context, ...meta });
  }

  error(message: string, trace?: string, context?: string, meta?: Record<string, unknown>) {
    this.logger.error({ message, trace, context, ...meta });
  }

  debug(message: string, context?: string, meta?: Record<string, unknown>) {
    this.logger.debug({ message, context, ...meta });
  }

  verbose(message: string, context?: string, meta?: Record<string, unknown>) {
    this.logger.verbose({ message, context, ...meta });
  }
}
