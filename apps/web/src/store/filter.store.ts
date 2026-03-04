import { create } from 'zustand';
import type { FilterState } from './models/filter-state.model';

function defaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7);
  return {
    fromDate: from.toISOString().split('T')[0],
    toDate: to.toISOString().split('T')[0],
  };
}

const initialState = {
  ...defaultDateRange(),
  organizationId: null as string | null,
  repositoryIds: [] as string[],
  contributorIds: [] as string[],
  teamIds: [] as string[],
};

export const useFilterStore = create<FilterState>((set) => ({
  ...initialState,
  setOrganizationId: (organizationId) => set({ organizationId, repositoryIds: [] }),
  setDateRange: (fromDate, toDate) => set({ fromDate, toDate }),
  setRepositoryIds: (repositoryIds) => set({ repositoryIds }),
  setContributorIds: (contributorIds) => set({ contributorIds }),
  setTeamIds: (teamIds) => set({ teamIds }),
  reset: () => set({ ...initialState }),
}));
