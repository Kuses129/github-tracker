import { Module } from '@nestjs/common';
import { RepositoriesController } from './repositories.controller';
import { RepositoriesRepository } from './repositories.repository';
import { RepositoriesService } from './repositories.service';

@Module({
  controllers: [RepositoriesController],
  providers: [RepositoriesRepository, RepositoriesService],
  exports: [RepositoriesService],
})
export class RepositoriesModule {}
