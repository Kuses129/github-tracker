import { AppBar, Toolbar, Typography, IconButton } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { useUiStore } from '../../store/ui.store';

export function TopBar() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <AppBar position="sticky" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
      <Toolbar>
        <IconButton edge="start" onClick={toggleSidebar} sx={{ mr: 2, color: 'text.secondary' }}>
          <MenuIcon />
        </IconButton>
        <Typography variant="h6" noWrap sx={{ color: 'text.primary' }}>
          GitHub Tracker
        </Typography>
      </Toolbar>
    </AppBar>
  );
}
