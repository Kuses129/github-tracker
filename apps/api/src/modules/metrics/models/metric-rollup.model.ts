import type { PeriodType } from '../../../generated/prisma';

export const METRIC_NAME_PRS_MERGED = 'prs_merged';

export interface UpsertRollupParams {
  organizationId: string;
  repositoryId?: string;
  periodType: PeriodType;
  periodStart: Date;
  metricName: string;
  value: number;
}

export interface FindMergeFrequencyParams {
  organizationId: string;
  repositoryIds?: string[];
  periodType: PeriodType;
  from: Date;
  to: Date;
}

export interface MergeFrequencyRow {
  period: Date;
  count: number;
}
