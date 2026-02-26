import { Injectable } from '@nestjs/common';
import type { Contributor } from '../../generated/prisma';
import { ContributorsRepository } from './contributors.repository';
import type { ContributorProps } from './models/contributor.models';

@Injectable()
export class ContributorsService {
  constructor(private readonly contributorsRepository: ContributorsRepository) {}

  upsert(input: ContributorProps): Promise<Contributor> {
    return this.contributorsRepository.upsert(input);
  }

  upsertByLogin(login: string): Promise<Contributor> {
    return this.contributorsRepository.upsertByLogin(login);
  }
}
