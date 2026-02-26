import { Module } from '@nestjs/common';
import { RepositoriesRepository } from './repositories.repository';
import { RepositoriesService } from './repositories.service';

@Module({
  providers: [RepositoriesRepository, RepositoriesService],
  exports: [RepositoriesService],
})
export class RepositoriesModule {}
