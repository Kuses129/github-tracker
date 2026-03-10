import { Injectable } from '@nestjs/common';
import type { BackfillRun, Prisma } from '../../generated/prisma';
import { BackfillRunStatus } from '../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';

const ACTIVE_STATUSES: BackfillRunStatus[] = [
  BackfillRunStatus.pending,
  BackfillRunStatus.discovering,
  BackfillRunStatus.in_progress,
];

@Injectable()
export class BackfillRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string): Promise<BackfillRun> {
    return this.prisma.backfillRun.create({
      data: {
        organizationId,
        status: BackfillRunStatus.pending,
      },
    });
  }

  async findActiveByOrg(organizationId: string): Promise<BackfillRun | null> {
    return this.prisma.backfillRun.findFirst({
      where: { organizationId, status: { in: ACTIVE_STATUSES } },
    });
  }

  async update(id: string, data: Prisma.BackfillRunUpdateInput): Promise<BackfillRun> {
    return this.prisma.backfillRun.update({ where: { id }, data });
  }
}
