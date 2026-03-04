import { Injectable } from '@nestjs/common';
import type { Repository } from '../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import type { RepositoryProps } from './models/repository.models';
import type { RepositoryWithStats } from './models/repository-with-stats.model';

@Injectable()
export class RepositoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(input: RepositoryProps): Promise<Repository> {
    const githubId = BigInt(input.githubId);

    return this.prisma.repository.upsert({
      where: { githubId },
      create: {
        githubId,
        organizationId: input.organizationId,
        name: input.name,
      },
      update: {
        name: input.name,
      },
    });
  }

  async removeByGithubId(githubId: number): Promise<void> {
    await this.prisma.repository.deleteMany({
      where: { githubId: BigInt(githubId) },
    });
  }

  async findAll(): Promise<Repository[]> {
    return this.prisma.repository.findMany({ orderBy: { name: 'asc' } });
  }

  async findByOrgId(orgId: string): Promise<Repository[]> {
    return this.prisma.repository.findMany({ where: { organizationId: orgId } });
  }

  async findWithStats(id: string): Promise<RepositoryWithStats | null> {
    const repo = await this.prisma.repository.findUnique({ where: { id } });
    if (!repo) return null;

    const [total, merged, open] = await Promise.all([
      this.prisma.pullRequest.count({ where: { repositoryId: id } }),
      this.prisma.pullRequest.count({ where: { repositoryId: id, state: 'merged' } }),
      this.prisma.pullRequest.count({ where: { repositoryId: id, state: 'open' } }),
    ]);

    return { ...repo, totalPullRequests: total, mergedPullRequests: merged, openPullRequests: open };
  }
}
