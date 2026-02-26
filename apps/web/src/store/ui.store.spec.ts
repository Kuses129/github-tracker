import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from './ui.store';

describe('useUiStore', () => {
  beforeEach(() => {
    useUiStore.setState({ sidebarOpen: true });
  });

  it('sidebarOpen is true by default', () => {
    expect(useUiStore.getState().sidebarOpen).toBe(true);
  });

  it('toggleSidebar sets sidebarOpen to false', () => {
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarOpen).toBe(false);
  });

  it('double toggle returns sidebarOpen to true', () => {
    useUiStore.getState().toggleSidebar();
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarOpen).toBe(true);
  });
});
