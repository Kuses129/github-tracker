import { Injectable } from '@nestjs/common';
import type { PeriodType } from '../../generated/prisma';
import { toExclusiveEndDate } from '../../common/date.utils';
import { MetricRollupRepository } from './metric-rollup.repository';
import { MetricsRepository } from './metrics.repository';
import type { MergeFrequencyQueryDto } from './models/merge-frequency-query.dto';
import type { MergeFrequencyResponse } from './models/merge-frequency.response';

const PERIOD_TYPE_MAP: Record<string, PeriodType> = {
  day: 'day' as PeriodType,
  week: 'week' as PeriodType,
  month: 'month' as PeriodType,
};

@Injectable()
export class MetricsService {
  constructor(
    private readonly metricsRepository: MetricsRepository,
    private readonly metricRollupRepository: MetricRollupRepository,
  ) {}

  async getMergeFrequency(query: MergeFrequencyQueryDto, orgId?: string): Promise<MergeFrequencyResponse> {
    const repositoryIds = query.repositories?.split(',').filter(Boolean);
    const from = new Date(query.from);
    const to = toExclusiveEndDate(query.to);
    const periodType = PERIOD_TYPE_MAP[query.groupBy];

    if (orgId) {
      const rollupRows = await this.metricRollupRepository.findMergeFrequency({
        organizationId: orgId,
        repositoryIds,
        periodType,
        from,
        to,
      });

      if (rollupRows.length > 0) {
        return {
          data: rollupRows.map(row => ({
            period: row.period instanceof Date ? row.period.toISOString().split('T')[0] : String(row.period),
            count: Number(row.count),
          })),
        };
      }
    }

    const rows = await this.metricsRepository.getMergeFrequency(from, to, query.groupBy, repositoryIds, orgId);

    return {
      data: rows.map(row => ({
        period: row.period.toISOString().split('T')[0],
        count: Number(row.count),
      })),
    };
  }
}
