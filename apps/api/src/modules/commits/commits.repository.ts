import { Injectable } from '@nestjs/common';
import type { Commit } from '../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import type { CommitProps } from './models/commit.models';

@Injectable()
export class CommitsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(input: CommitProps): Promise<Commit> {
    return this.prisma.commit.upsert({
      where: { sha: input.sha },
      create: {
        sha: input.sha,
        repositoryId: input.repositoryId,
        authorId: input.authorId,
        message: input.message,
        committedAt: input.committedAt,
      },
      update: {
        message: input.message,
        committedAt: input.committedAt,
      },
    });
  }
}
