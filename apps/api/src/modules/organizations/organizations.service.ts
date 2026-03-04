import { Injectable } from '@nestjs/common';
import type { Organization } from '../../generated/prisma';
import type { OrganizationProps } from './models/organization.models';
import type { OrganizationResponse } from './models/organization.response';
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

  async getOrganizations(): Promise<OrganizationResponse[]> {
    const orgs = await this.organizationsRepository.findAll();
    return orgs.map(org => this.mapToResponse(org));
  }

  private mapToResponse(org: Organization): OrganizationResponse {
    return {
      id: org.id,
      githubId: Number(org.githubId),
      login: org.login,
      createdAt: org.createdAt.toISOString(),
    };
  }
}
