import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss } from 'pg-boss';
import type { SendOptions, WorkOptions, Job } from 'pg-boss';
import type { AppConfig } from '../../config/config.schema';
import type { QueueOptions } from 'pg-boss';

const DEFAULT_RETRY_LIMIT = 3;
const DEFAULT_EXPIRE_SECONDS = 24 * 60 * 60; // 24 hours

@Injectable()
export class PgBossService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PgBossService.name);
  private boss: PgBoss;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    const connectionString = this.configService.get('DATABASE_URL', { infer: true })!;

    this.boss = new PgBoss({ connectionString });

    this.boss.on('error', (error: Error) => {
      this.logger.error({ error: error.message }, 'pg-boss error');
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.boss.start();
      this.logger.log('pg-boss started');
    } catch (error) {
      this.logger.error('pg-boss failed to start', error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.boss.stop({ graceful: true, timeout: 30_000 });
      this.logger.log('pg-boss stopped');
    } catch (error) {
      this.logger.error('pg-boss failed to stop cleanly', error instanceof Error ? error.stack : String(error));
    }
  }

  async createQueue(name: string, options?: Partial<QueueOptions>): Promise<void> {
    await this.boss.createQueue(name, {
      retryLimit: DEFAULT_RETRY_LIMIT,
      retryBackoff: true,
      expireInSeconds: DEFAULT_EXPIRE_SECONDS,
      ...options,
    });
  }

  async send<T extends object>(name: string, data: T, options?: SendOptions): Promise<string | null> {
    const jobId = await this.boss.send(name, data, options);
    if (jobId === null) {
      this.logger.warn({ queue: name }, 'Job was not created (throttled or rejected by queue policy)');
    }
    return jobId;
  }

  async work<T extends object>(
    name: string,
    options: WorkOptions,
    handler: (job: Job<T>) => Promise<void>,
  ): Promise<string> {
    return this.boss.work<T>(name, { ...options, batchSize: 1 }, async (jobs: Job<T>[]) => {
      for (const job of jobs) {
        await handler(job);
      }
    });
  }
}
