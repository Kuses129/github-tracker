import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MetricsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getMergeFrequency(
    from: Date,
    to: Date,
    groupBy: 'day' | 'week' | 'month',
    repositoryIds?: string[],
    orgId?: string,
  ): Promise<{ period: Date; count: bigint }[]> {
    const truncLiterals: Record<string, Prisma.Sql> = {
      day: Prisma.sql`'day'`,
      week: Prisma.sql`'week'`,
      month: Prisma.sql`'month'`,
    };
    const trunc = truncLiterals[groupBy];

    const repoFilter =
      repositoryIds?.length
        ? Prisma.sql`AND pr."repositoryId" = ANY(${repositoryIds}::uuid[])`
        : Prisma.empty;

    const orgFilter = orgId
      ? Prisma.sql`AND r."organizationId" = ${orgId}::uuid`
      : Prisma.empty;

    return this.prisma.$queryRaw`
      SELECT
        date_trunc(${trunc}, pr."mergedAt") AS period,
        COUNT(*) AS count
      FROM pull_requests pr
      JOIN repositories r ON r.id = pr."repositoryId"
      WHERE pr.state = 'merged'
        AND pr."mergedAt" >= ${from}
        AND pr."mergedAt" < ${to}
        ${orgFilter}
        ${repoFilter}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  }
}
