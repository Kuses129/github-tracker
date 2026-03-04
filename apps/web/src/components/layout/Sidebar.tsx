import { Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material';
import GitHubIcon from '@mui/icons-material/GitHub';
import { useLocation, useNavigate } from 'react-router-dom';
import { SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_WIDTH } from './constants';
import { useUiStore } from '../../store/ui.store';
import { NAV_ITEMS } from '../../config/navigation';

export function Sidebar() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const location = useLocation();
  const navigate = useNavigate();
  const currentWidth = sidebarOpen ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH;

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: currentWidth,
        flexShrink: 0,
        transition: 'width 0.2s',
        '& .MuiDrawer-paper': {
          width: currentWidth,
          boxSizing: 'border-box',
          overflowX: 'hidden',
          transition: 'width 0.2s',
        },
      }}
    >
      <Box
        sx={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          px: 2,
          gap: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        <GitHubIcon sx={{ color: 'primary.main', fontSize: 24, flexShrink: 0 }} />
        {sidebarOpen && (
          <Typography variant="subtitle2" noWrap sx={{ color: 'text.primary', fontWeight: 700 }}>
            GitHub Tracker
          </Typography>
        )}
      </Box>
      <List sx={{ pt: 1 }}>
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);
          return (
            <ListItemButton
              key={item.path}
              selected={isActive}
              onClick={() => navigate(item.path)}
              aria-current={isActive ? 'page' : undefined}
            >
              <ListItemIcon sx={{ minWidth: sidebarOpen ? 40 : 'auto' }}>{item.icon}</ListItemIcon>
              {sidebarOpen && <ListItemText primary={item.label} />}
            </ListItemButton>
          );
        })}
      </List>
    </Drawer>
  );
}
