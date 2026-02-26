import { create } from 'zustand';
import type { FilterState } from './models/filter-state.model';

const initialState = {
  fromDate: null,
  toDate: null,
  repositoryIds: [] as string[],
  contributorIds: [] as string[],
  teamIds: [] as string[],
};

export const useFilterStore = create<FilterState>((set) => ({
  ...initialState,
  setDateRange: (fromDate, toDate) => set({ fromDate, toDate }),
  setRepositoryIds: (repositoryIds) => set({ repositoryIds }),
  setContributorIds: (contributorIds) => set({ contributorIds }),
  setTeamIds: (teamIds) => set({ teamIds }),
  reset: () => set({ ...initialState }),
}));
