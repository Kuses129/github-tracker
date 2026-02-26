import type {
  InstallationAction,
  InstallationRepositoriesAction,
  PullRequestAction,
  PullRequestReviewAction,
  PullRequestReviewState,
  PullRequestState,
} from './webhook-event.types';

export type { GitHubEventType } from './webhook-event.types';

export interface GitHubUserPayload {
  id: number;
  login: string;
}

export interface GitHubRepositoryPayload {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
}

export interface InstallationPayload {
  action: InstallationAction;
  installation: {
    id: number;
    account: GitHubUserPayload;
  };
  repositories?: GitHubRepositoryPayload[];
}

export interface InstallationRepositoriesPayload {
  action: InstallationRepositoriesAction;
  installation: {
    id: number;
    account: GitHubUserPayload;
  };
  repositories_added: GitHubRepositoryPayload[];
  repositories_removed: GitHubRepositoryPayload[];
}

export interface PullRequestPayload {
  action: PullRequestAction;
  pull_request: {
    id: number;
    number: number;
    title: string;
    html_url: string;
    state: PullRequestState;
    merged: boolean | null;
    additions: number;
    deletions: number;
    changed_files: number;
    created_at: string;
    merged_at: string | null;
    user: GitHubUserPayload;
  };
  repository: GitHubRepositoryPayload & { owner: GitHubUserPayload };
}

export interface PullRequestReviewPayload {
  action: PullRequestReviewAction;
  review: {
    id: number;
    state: PullRequestReviewState;
    submitted_at: string;
    user: GitHubUserPayload;
  };
  pull_request: {
    id: number;
    number: number;
    user: GitHubUserPayload;
  };
  repository: GitHubRepositoryPayload & { owner: GitHubUserPayload };
}

export interface PushEventCommit {
  id: string;
  message: string;
  timestamp: string;
  author: {
    name: string;
    email: string;
    username?: string;
  };
}

export interface PushPayload {
  ref: string;
  before: string;
  after: string;
  commits: PushEventCommit[];
  repository: GitHubRepositoryPayload & { owner: GitHubUserPayload };
  sender: GitHubUserPayload;
}
