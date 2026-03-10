import { Injectable } from '@nestjs/common';
import type { Commit } from '../../generated/prisma';
import type { PrismaTransactionClient } from '../../prisma/prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { CommitProps } from './models/commit.models';

@Injectable()
export class CommitsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTransactionClient): PrismaTransactionClient {
    return tx ?? this.prisma;
  }

  async upsert(input: CommitProps, tx?: PrismaTransactionClient): Promise<Commit> {
    return this.client(tx).commit.upsert({
      where: { sha: input.sha },
      create: {
        sha: input.sha,
        repositoryId: input.repositoryId,
        authorId: input.authorId,
        message: input.message,
        committedAt: input.committedAt,
        ...(input.backfillTaskId && { backfillTaskId: input.backfillTaskId }),
      },
      update: {
        message: input.message,
        committedAt: input.committedAt,
        ...(input.backfillTaskId && { backfillTaskId: input.backfillTaskId }),
      },
    });
  }
}
