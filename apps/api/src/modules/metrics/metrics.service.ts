import { Injectable } from '@nestjs/common';
import { toExclusiveEndDate } from '../../common/date.utils';
import { MetricsRepository } from './metrics.repository';
import type { MergeFrequencyQueryDto } from './models/merge-frequency-query.dto';
import type { MergeFrequencyResponse } from './models/merge-frequency.response';

@Injectable()
export class MetricsService {
  constructor(private readonly metricsRepository: MetricsRepository) {}

  async getMergeFrequency(query: MergeFrequencyQueryDto, orgId?: string): Promise<MergeFrequencyResponse> {
    const repositoryIds = query.repositories?.split(',').filter(Boolean);
    const rows = await this.metricsRepository.getMergeFrequency(
      new Date(query.from),
      toExclusiveEndDate(query.to),
      query.groupBy,
      repositoryIds,
      orgId,
    );
    return {
      data: rows.map(row => ({
        period: row.period.toISOString().split('T')[0],
        count: Number(row.count),
      })),
    };
  }
}
