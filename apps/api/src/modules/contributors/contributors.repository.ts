import { Injectable } from '@nestjs/common';
import type { Contributor } from '../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import type { ContributorProps } from './models/contributor.models';

@Injectable()
export class ContributorsRepository {
  constructor(private readonly prisma: PrismaService) {}

  upsert(input: ContributorProps): Promise<Contributor> {
    const githubId = BigInt(input.githubId);
    return this.prisma.contributor.upsert({
      where: { githubId },
      create: { githubId, login: input.login },
      update: { login: input.login },
    });
  }

  upsertByLogin(login: string): Promise<Contributor> {
    return this.prisma.contributor.upsert({
      where: { login },
      create: { githubId: BigInt(0), login },
      update: {},
    });
  }
}
