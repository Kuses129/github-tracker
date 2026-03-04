import { Controller, Get } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import type { OrganizationResponse } from './models/organization.response';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  async getOrganizations(): Promise<OrganizationResponse[]> {
    return this.organizationsService.getOrganizations();
  }
}
