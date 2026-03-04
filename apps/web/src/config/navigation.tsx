import DashboardIcon from '@mui/icons-material/Dashboard';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import CommitIcon from '@mui/icons-material/Commit';
import PeopleIcon from '@mui/icons-material/People';
import FolderIcon from '@mui/icons-material/Folder';
import GroupsIcon from '@mui/icons-material/Groups';

export interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', path: '/', icon: <DashboardIcon /> },
  { label: 'Pull Requests', path: '/pull-requests', icon: <MergeTypeIcon /> },
  { label: 'Commits', path: '/commits', icon: <CommitIcon /> },
  { label: 'Contributors', path: '/contributors', icon: <PeopleIcon /> },
  { label: 'Repositories', path: '/repositories', icon: <FolderIcon /> },
  { label: 'Teams', path: '/teams', icon: <GroupsIcon /> },
];
