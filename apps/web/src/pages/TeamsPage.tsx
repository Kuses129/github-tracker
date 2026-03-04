import GroupsIcon from '@mui/icons-material/Groups';
import { ComingSoonPage } from '../components/ComingSoonPage';

export function TeamsPage() {
  return (
    <ComingSoonPage
      title="Teams"
      subtitle="Team-level performance and collaboration metrics"
      description="Team analytics will be available in a future release."
      icon={<GroupsIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1.5 }} />}
    />
  );
}
