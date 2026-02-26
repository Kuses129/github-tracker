import { Injectable } from '@nestjs/common';
import type { Repository } from '../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import type { RepositoryProps } from './models/repository.models';

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
}
