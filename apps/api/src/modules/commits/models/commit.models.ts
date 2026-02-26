export interface CommitProps {
  sha: string;
  repositoryId: string;
  authorId: string | null;
  message: string;
  committedAt: Date;
}
