export interface PullRequestFilters {
  from?: Date;
  to?: Date;
  state?: string;
  cursorDate?: Date;
  cursorId?: string;
  limit: number;
}
