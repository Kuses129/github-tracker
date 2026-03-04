import { Injectable, NotFoundException } from '@nestjs/common';
import type { Repository } from '../../generated/prisma';
import type { RepositoryResponse } from './models/repository.response';
import type { RepositoryProps } from './models/repository.models';
import type { RepositoryStatsResponse } from './models/repository-stats.response';
import { RepositoriesRepository } from './repositories.repository';

@Injectable()
export class RepositoriesService {
  constructor(private readonly repositoriesRepository: RepositoriesRepository) {}

  async upsert(input: RepositoryProps): Promise<Repository> {
    return this.repositoriesRepository.upsert(input);
  }

  async removeByGithubId(githubId: number): Promise<void> {
    return this.repositoriesRepository.removeByGithubId(githubId);
  }

  async listByOrgId(orgId: string): Promise<RepositoryResponse[]> {
    const repos = await this.repositoriesRepository.findByOrgId(orgId);
    return repos.map(repo => this.mapToResponse(repo));
  }

  async listRepositories(): Promise<RepositoryResponse[]> {
    const repos = await this.repositoriesRepository.findAll();
    return repos.map(repo => this.mapToResponse(repo));
  }

  async getRepository(repoId: string): Promise<RepositoryStatsResponse> {
    const repo = await this.repositoriesRepository.findWithStats(repoId);
    if (!repo) {
      throw new NotFoundException(`Repository ${repoId} not found`);
    }
    return {
      ...this.mapToResponse(repo),
      totalPullRequests: repo.totalPullRequests,
      mergedPullRequests: repo.mergedPullRequests,
      openPullRequests: repo.openPullRequests,
    };
  }

  private mapToResponse(repo: Repository): RepositoryResponse {
    return {
      id: repo.id,
      githubId: Number(repo.githubId),
      name: repo.name,
      organizationId: repo.organizationId,
      createdAt: repo.createdAt.toISOString(),
    };
  }
}
