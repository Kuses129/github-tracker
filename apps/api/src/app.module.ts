import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PullRequestsModule } from './modules/pull-requests/pull-requests.module';
import { RepositoriesModule } from './modules/repositories/repositories.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { CorrelationIdInterceptor } from './common/interceptors/correlation-id.interceptor';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    HealthModule,
    MetricsModule,
    OrganizationsModule,
    PullRequestsModule,
    RepositoriesModule,
    WebhooksModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: CorrelationIdInterceptor },
  ],
})
export class AppModule {}
