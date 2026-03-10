import { Injectable, Logger } from '@nestjs/common';
import { PeriodType } from '../../generated/prisma';
import { MetricRollupRepository } from './metric-rollup.repository';
import { METRIC_NAME_PRS_MERGED } from './models/metric-rollup.model';

@Injectable()
export class MetricRollupService {
  private readonly logger = new Logger(MetricRollupService.name);

  constructor(private readonly metricRollupRepository: MetricRollupRepository) {}

  async computeForRepository(repositoryId: string): Promise<void> {
    const organizationId = await this.metricRollupRepository.findRepositoryOrgId(repositoryId);
    if (!organizationId) {
      this.logger.warn({ repositoryId }, 'Repository not found, skipping rollup computation');
      return;
    }

    await this.metricRollupRepository.computeDailyRollupsFromPrs(
      repositoryId,
      organizationId,
      METRIC_NAME_PRS_MERGED,
    );
    await this.metricRollupRepository.deriveAggregatedRollups(
      repositoryId,
      organizationId,
      'week',
      METRIC_NAME_PRS_MERGED,
    );
    await this.metricRollupRepository.deriveAggregatedRollups(
      repositoryId,
      organizationId,
      'month',
      METRIC_NAME_PRS_MERGED,
    );

    this.logger.log({ repositoryId, organizationId }, 'Metric rollups computed for repository');
  }

  async upsertTodayRollupForRepo(repositoryId: string, organizationId: string): Promise<void> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 86400000);

    const count = await this.metricRollupRepository.countMergedPrsForRepo(repositoryId, today, tomorrow);

    await this.metricRollupRepository.upsertRollup({
      organizationId,
      repositoryId,
      periodType: PeriodType.day,
      periodStart: today,
      metricName: METRIC_NAME_PRS_MERGED,
      value: count,
    });

    this.logger.log({ repositoryId, organizationId, date: today.toISOString(), count }, 'Today rollup upserted');
  }
}
