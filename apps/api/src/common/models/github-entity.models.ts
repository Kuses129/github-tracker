export interface GitHubEntityProps {
  githubId: number;
}

export interface GitHubAccountProps extends GitHubEntityProps {
  login: string;
}
