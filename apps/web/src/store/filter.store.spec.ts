import { beforeEach, describe, expect, it } from 'vitest';
import { useFilterStore } from './filter.store';

describe('useFilterStore', () => {
  beforeEach(() => {
    useFilterStore.getState().reset();
  });

  it('has correct initial state', () => {
    const state = useFilterStore.getState();
    expect(state.fromDate).toBeNull();
    expect(state.toDate).toBeNull();
    expect(state.repositoryIds).toEqual([]);
    expect(state.contributorIds).toEqual([]);
    expect(state.teamIds).toEqual([]);
  });

  it('setDateRange updates fromDate and toDate', () => {
    useFilterStore.getState().setDateRange('2024-01-01', '2024-12-31');
    const state = useFilterStore.getState();
    expect(state.fromDate).toBe('2024-01-01');
    expect(state.toDate).toBe('2024-12-31');
  });

  it('setRepositoryIds updates repositoryIds', () => {
    useFilterStore.getState().setRepositoryIds(['repo-1', 'repo-2']);
    expect(useFilterStore.getState().repositoryIds).toEqual(['repo-1', 'repo-2']);
  });

  it('reset restores initial state after mutations', () => {
    const store = useFilterStore.getState();
    store.setDateRange('2024-01-01', '2024-06-01');
    store.setRepositoryIds(['repo-1']);
    store.setContributorIds(['user-1']);
    store.setTeamIds(['team-1']);
    store.reset();

    const state = useFilterStore.getState();
    expect(state.fromDate).toBeNull();
    expect(state.toDate).toBeNull();
    expect(state.repositoryIds).toEqual([]);
    expect(state.contributorIds).toEqual([]);
    expect(state.teamIds).toEqual([]);
  });
});
