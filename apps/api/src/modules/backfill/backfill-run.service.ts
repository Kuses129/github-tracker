import { Injectable } from '@nestjs/common';
import type { BackfillRun, Prisma } from '../../generated/prisma';
import { BackfillRunRepository } from './backfill-run.repository';

@Injectable()
export class BackfillRunService {
  constructor(private readonly backfillRunRepository: BackfillRunRepository) {}

  async create(organizationId: string): Promise<BackfillRun> {
    return this.backfillRunRepository.create(organizationId);
  }

  async findActiveByOrg(organizationId: string): Promise<BackfillRun | null> {
    return this.backfillRunRepository.findActiveByOrg(organizationId);
  }

  async update(id: string, data: Prisma.BackfillRunUpdateInput): Promise<BackfillRun> {
    return this.backfillRunRepository.update(id, data);
  }
}
