import { Injectable } from '@nestjs/common';
import type { PullRequestCommit } from '../../generated/prisma';
import type { PrismaTransactionClient } from '../../prisma/prisma.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PullRequestCommitsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTransactionClient): PrismaTransactionClient {
    return tx ?? this.prisma;
  }

  async upsert(
    pullRequestId: string,
    commitId: string,
    tx?: PrismaTransactionClient,
  ): Promise<PullRequestCommit> {
    return this.client(tx).pullRequestCommit.upsert({
      where: { pullRequestId_commitId: { pullRequestId, commitId } },
      create: { pullRequestId, commitId },
      update: {},
    });
  }
}
