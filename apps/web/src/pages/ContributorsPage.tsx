import PeopleIcon from '@mui/icons-material/People';
import { ComingSoonPage } from '../components/ComingSoonPage';

export function ContributorsPage() {
  return (
    <ComingSoonPage
      title="Contributors"
      subtitle="Contributor activity and impact metrics"
      description="Contributor analytics will be available in a future release."
      icon={<PeopleIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1.5 }} />}
    />
  );
}
