import { Drawer, List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import DashboardIcon from '@mui/icons-material/Dashboard';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import CommitIcon from '@mui/icons-material/Commit';
import PeopleIcon from '@mui/icons-material/People';
import FolderIcon from '@mui/icons-material/Folder';
import GroupsIcon from '@mui/icons-material/Groups';
import { SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_WIDTH } from './constants';
import { useUiStore } from '../../store/ui.store';

const NAV_ITEMS = [
  { label: 'Overview', path: '/', icon: <DashboardIcon /> },
  { label: 'Pull Requests', path: '/pull-requests', icon: <MergeTypeIcon /> },
  { label: 'Commits', path: '/commits', icon: <CommitIcon /> },
  { label: 'Contributors', path: '/contributors', icon: <PeopleIcon /> },
  { label: 'Repositories', path: '/repositories', icon: <FolderIcon /> },
  { label: 'Teams', path: '/teams', icon: <GroupsIcon /> },
] as const;

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
      <List sx={{ mt: 8 }}>
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
              <ListItemIcon>{item.icon}</ListItemIcon>
              {sidebarOpen && <ListItemText primary={item.label} />}
            </ListItemButton>
          );
        })}
      </List>
    </Drawer>
  );
}
