export interface FilterState {
  organizationId: string | null;
  fromDate: string | null;
  toDate: string | null;
  repositoryIds: string[];
  contributorIds: string[];
  teamIds: string[];
  setOrganizationId: (id: string | null) => void;
  setDateRange: (from: string | null, to: string | null) => void;
  setRepositoryIds: (ids: string[]) => void;
  setContributorIds: (ids: string[]) => void;
  setTeamIds: (ids: string[]) => void;
  reset: () => void;
}
