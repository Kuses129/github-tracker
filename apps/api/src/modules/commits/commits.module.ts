import { Module } from '@nestjs/common';
import { CommitsRepository } from './commits.repository';
import { CommitsService } from './commits.service';

@Module({
  providers: [CommitsRepository, CommitsService],
  exports: [CommitsService],
})
export class CommitsModule {}
