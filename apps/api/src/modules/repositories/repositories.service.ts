import { Injectable } from '@nestjs/common';
import type { Repository } from '../../generated/prisma';
import type { RepositoryProps } from './models/repository.models';
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
}
