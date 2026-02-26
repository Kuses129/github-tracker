export interface FilterState {
  fromDate: string | null;
  toDate: string | null;
  repositoryIds: string[];
  contributorIds: string[];
  teamIds: string[];
  setDateRange: (from: string | null, to: string | null) => void;
  setRepositoryIds: (ids: string[]) => void;
  setContributorIds: (ids: string[]) => void;
  setTeamIds: (ids: string[]) => void;
  reset: () => void;
}
