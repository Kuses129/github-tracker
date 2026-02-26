import { Injectable } from '@nestjs/common';
import type { Organization } from '../../generated/prisma';
import type { OrganizationProps } from './models/organization.models';
import { OrganizationsRepository } from './organizations.repository';

@Injectable()
export class OrganizationsService {
  constructor(private readonly organizationsRepository: OrganizationsRepository) {}

  async upsert(input: OrganizationProps): Promise<Organization> {
    return this.organizationsRepository.upsert(input);
  }

  async markInactive(githubId: number): Promise<void> {
    return this.organizationsRepository.markInactive(githubId);
  }
}
