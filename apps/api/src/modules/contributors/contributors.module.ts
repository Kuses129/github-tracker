import { Module } from '@nestjs/common';
import { ContributorsRepository } from './contributors.repository';
import { ContributorsService } from './contributors.service';

@Module({
  providers: [ContributorsRepository, ContributorsService],
  exports: [ContributorsService],
})
export class ContributorsModule {}
