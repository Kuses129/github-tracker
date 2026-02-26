import { Injectable } from '@nestjs/common';
import type { Commit } from '../../generated/prisma';
import { CommitsRepository } from './commits.repository';
import type { CommitProps } from './models/commit.models';

@Injectable()
export class CommitsService {
  constructor(private readonly commitsRepository: CommitsRepository) {}

  async upsert(input: CommitProps): Promise<Commit> {
    return this.commitsRepository.upsert(input);
  }
}
