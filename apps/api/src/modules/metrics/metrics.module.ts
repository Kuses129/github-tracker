import { Module } from '@nestjs/common';
import { MetricRollupRepository } from './metric-rollup.repository';
import { MetricRollupService } from './metric-rollup.service';
import { MetricsController } from './metrics.controller';
import { MetricsRepository } from './metrics.repository';
import { MetricsService } from './metrics.service';

@Module({
  controllers: [MetricsController],
  providers: [MetricsRepository, MetricsService, MetricRollupRepository, MetricRollupService],
  exports: [MetricRollupService],
})
export class MetricsModule {}
