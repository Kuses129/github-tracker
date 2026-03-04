import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MergeFrequencyQueryDto } from './models/merge-frequency-query.dto';
import type { MergeFrequencyResponse } from './models/merge-frequency.response';

@Controller()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('metrics/merge-frequency')
  async getGlobalMergeFrequency(
    @Query() query: MergeFrequencyQueryDto,
  ): Promise<MergeFrequencyResponse> {
    return this.metricsService.getMergeFrequency(query);
  }

  @Get('organizations/:orgId/metrics/merge-frequency')
  async getMergeFrequency(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query() query: MergeFrequencyQueryDto,
  ): Promise<MergeFrequencyResponse> {
    return this.metricsService.getMergeFrequency(query, orgId);
  }
}
