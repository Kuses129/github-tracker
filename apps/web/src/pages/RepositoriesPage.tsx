import FolderIcon from '@mui/icons-material/Folder';
import { ComingSoonPage } from '../components/ComingSoonPage';

export function RepositoriesPage() {
  return (
    <ComingSoonPage
      title="Repositories"
      subtitle="Health and activity overview for all tracked repositories"
      description="Repository analytics will be available in a future release."
      icon={<FolderIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1.5 }} />}
    />
  );
}
