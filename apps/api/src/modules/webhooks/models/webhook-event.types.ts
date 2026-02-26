export type GitHubEventType =
  | 'installation'
  | 'installation_repositories'
  | 'pull_request'
  | 'pull_request_review'
  | 'push';

export type InstallationAction =
  | 'created'
  | 'deleted'
  | 'suspend'
  | 'unsuspend'
  | 'new_permissions_accepted';

export type InstallationRepositoriesAction = 'added' | 'removed';

export type PullRequestAction =
  | 'opened'
  | 'closed'
  | 'reopened'
  | 'edited'
  | 'synchronize'
  | 'review_requested'
  | 'review_request_removed'
  | 'labeled'
  | 'unlabeled'
  | 'assigned'
  | 'unassigned'
  | 'ready_for_review'
  | 'converted_to_draft';

export type PullRequestState = 'open' | 'closed';

export type PullRequestReviewAction = 'submitted' | 'edited' | 'dismissed';

export type PullRequestReviewState =
  | 'approved'
  | 'changes_requested'
  | 'commented'
  | 'dismissed'
  | 'pending';
