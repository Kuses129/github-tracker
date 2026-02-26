import { Injectable } from '@nestjs/common';
import type { Organization } from '../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import type { OrganizationProps } from './models/organization.models';

@Injectable()
export class OrganizationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(input: OrganizationProps): Promise<Organization> {
    const githubId = BigInt(input.githubId);
    return this.prisma.organization.upsert({
      where: { githubId },
      create: { githubId, login: input.login },
      update: { login: input.login },
    });
  }

  async markInactive(githubId: number): Promise<void> {
    await this.prisma.organization.updateMany({
      where: { githubId: BigInt(githubId) },
      data: { isActive: false },
    });
  }
}
