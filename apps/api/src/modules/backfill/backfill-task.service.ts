import { Injectable } from '@nestjs/common';
import type { BackfillTask, Prisma } from '../../generated/prisma';
import { BackfillTaskRepository } from './backfill-task.repository';

interface CreateTaskInput {
  backfillRunId: string;
  repositoryId: string;
}

@Injectable()
export class BackfillTaskService {
  constructor(private readonly backfillTaskRepository: BackfillTaskRepository) {}

  async createMany(tasks: CreateTaskInput[]): Promise<BackfillTask[]> {
    return this.backfillTaskRepository.createMany(tasks);
  }

  async update(id: string, data: Prisma.BackfillTaskUpdateInput): Promise<BackfillTask> {
    return this.backfillTaskRepository.update(id, data);
  }
}
