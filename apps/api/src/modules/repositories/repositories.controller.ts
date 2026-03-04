import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { RepositoriesService } from './repositories.service';
import type { RepositoryResponse } from './models/repository.response';
import type { RepositoryStatsResponse } from './models/repository-stats.response';

@Controller('repositories')
export class RepositoriesController {
  constructor(private readonly repositoriesService: RepositoriesService) {}

  @Get()
  async listRepositories(): Promise<RepositoryResponse[]> {
    return this.repositoriesService.listRepositories();
  }

  @Get(':repoId')
  async getRepository(@Param('repoId', ParseUUIDPipe) repoId: string): Promise<RepositoryStatsResponse> {
    return this.repositoriesService.getRepository(repoId);
  }
}
