import { Injectable } from '@nestjs/common';
import type { Commit } from '../../generated/prisma';
import type { PrismaTransactionClient } from '../../prisma/prisma.service';
import { CommitsRepository } from './commits.repository';
import type { CommitProps } from './models/commit.models';

@Injectable()
export class CommitsService {
  constructor(private readonly commitsRepository: CommitsRepository) {}

  async upsert(input: CommitProps, tx?: PrismaTransactionClient): Promise<Commit> {
    return this.commitsRepository.upsert(input, tx);
  }
}
