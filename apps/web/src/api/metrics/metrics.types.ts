export interface MergeFrequencyPeriod {
  period: string;
  count: number;
}

export interface MergeFrequencyResponse {
  data: MergeFrequencyPeriod[];
}

export interface MergeFrequencyParams {
  from: string;
  to: string;
  groupBy: 'day' | 'week' | 'month';
  orgId?: string;
  repositories?: string[];
}
