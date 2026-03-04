import CommitIcon from '@mui/icons-material/Commit';
import { ComingSoonPage } from '../components/ComingSoonPage';

export function CommitsPage() {
  return (
    <ComingSoonPage
      title="Commits"
      subtitle="Commit activity across your repositories"
      description="Commit analytics will be available in a future release."
      icon={<CommitIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1.5 }} />}
    />
  );
}
