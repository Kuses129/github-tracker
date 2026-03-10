import { Injectable } from '@nestjs/common';
import type { BackfillTask, Prisma } from '../../generated/prisma';
import { BackfillTaskStatus } from '../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';

interface CreateTaskInput {
  backfillRunId: string;
  repositoryId: string;
}

@Injectable()
export class BackfillTaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createMany(tasks: CreateTaskInput[]): Promise<BackfillTask[]> {
    if (tasks.length === 0) return [];

    await this.prisma.backfillTask.createMany({
      data: tasks.map(task => ({
        backfillRunId: task.backfillRunId,
        repositoryId: task.repositoryId,
        status: BackfillTaskStatus.pending,
      })),
    });

    return this.prisma.backfillTask.findMany({
      where: {
        backfillRunId: tasks[0].backfillRunId,
      },
    });
  }

  async update(id: string, data: Prisma.BackfillTaskUpdateInput): Promise<BackfillTask> {
    return this.prisma.backfillTask.update({ where: { id }, data });
  }
}
