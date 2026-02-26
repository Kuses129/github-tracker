import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_WIDTH } from './constants';
import { useUiStore } from '../../store/ui.store';

export function AppLayout() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const currentWidth = sidebarOpen ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <Box sx={{ flexGrow: 1, ml: `${currentWidth}px`, transition: 'margin-left 0.2s' }}>
        <TopBar />
        <Box component="main" sx={{ p: 3, maxWidth: 1200 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
