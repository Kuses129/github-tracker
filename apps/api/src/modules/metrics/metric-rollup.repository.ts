import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import type { FindMergeFrequencyParams, MergeFrequencyRow, UpsertRollupParams } from './models/metric-rollup.model';
import { METRIC_NAME_PRS_MERGED } from './models/metric-rollup.model';

@Injectable()
export class MetricRollupRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMergeFrequency(params: FindMergeFrequencyParams): Promise<MergeFrequencyRow[]> {
    const { organizationId, repositoryIds, periodType, from, to } = params;

    const repoFilter = repositoryIds?.length
      ? Prisma.sql`AND mr."repositoryId" = ANY(${repositoryIds}::uuid[])`
      : Prisma.empty;

    return this.prisma.$queryRaw<MergeFrequencyRow[]>`
      SELECT
        mr."periodStart" AS period,
        CAST(SUM(mr.value) AS integer) AS count
      FROM metric_rollups mr
      WHERE mr."organizationId" = ${organizationId}::uuid
        AND mr."periodType" = ${periodType}::"PeriodType"
        AND mr."metricName" = ${METRIC_NAME_PRS_MERGED}
        AND mr."periodStart" >= ${from}
        AND mr."periodStart" < ${to}
        ${repoFilter}
      GROUP BY mr."periodStart"
      ORDER BY mr."periodStart" ASC
    `;
  }

  async upsertRollup(data: UpsertRollupParams): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO metric_rollups (
        id,
        "organizationId",
        "repositoryId",
        "periodType",
        "periodStart",
        "metricName",
        value,
        "createdAt",
        "updatedAt"
      )
      VALUES (
        gen_random_uuid(),
        ${data.organizationId}::uuid,
        ${data.repositoryId ?? null}::uuid,
        ${data.periodType}::"PeriodType",
        ${data.periodStart},
        ${data.metricName},
        ${data.value},
        now(),
        now()
      )
      ON CONFLICT ("organizationId", "repositoryId", "periodType", "periodStart", "metricName")
        WHERE "repositoryId" IS NOT NULL
      DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()
    `;
  }

  async countMergedPrsForRepo(repositoryId: string, from: Date, to: Date): Promise<number> {
    const result = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count
      FROM pull_requests pr
      WHERE pr."repositoryId" = ${repositoryId}::uuid
        AND pr.state = 'merged'
        AND pr."mergedAt" >= ${from}
        AND pr."mergedAt" < ${to}
    `;
    return Number(result[0]?.count ?? 0);
  }

  async computeDailyRollupsFromPrs(repositoryId: string, organizationId: string, metricName: string): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO metric_rollups (
        id, "organizationId", "repositoryId", "periodType", "periodStart",
        "metricName", value, "createdAt", "updatedAt"
      )
      SELECT
        gen_random_uuid(),
        ${organizationId}::uuid,
        ${repositoryId}::uuid,
        'day'::"PeriodType",
        date_trunc('day', pr."mergedAt")::date,
        ${metricName},
        COUNT(*),
        now(),
        now()
      FROM pull_requests pr
      WHERE pr."repositoryId" = ${repositoryId}::uuid
        AND pr.state = 'merged'
        AND pr."mergedAt" IS NOT NULL
      GROUP BY date_trunc('day', pr."mergedAt")::date
      ON CONFLICT ("organizationId", "repositoryId", "periodType", "periodStart", "metricName")
        WHERE "repositoryId" IS NOT NULL
      DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()
    `;
  }

  async deriveAggregatedRollups(
    repositoryId: string,
    organizationId: string,
    targetPeriodType: 'week' | 'month',
    metricName: string,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO metric_rollups (
        id, "organizationId", "repositoryId", "periodType", "periodStart",
        "metricName", value, "createdAt", "updatedAt"
      )
      SELECT
        gen_random_uuid(),
        ${organizationId}::uuid,
        ${repositoryId}::uuid,
        ${targetPeriodType}::"PeriodType",
        date_trunc(${targetPeriodType}, mr."periodStart")::date,
        ${metricName},
        SUM(mr.value),
        now(),
        now()
      FROM metric_rollups mr
      WHERE mr."organizationId" = ${organizationId}::uuid
        AND mr."repositoryId" = ${repositoryId}::uuid
        AND mr."periodType" = 'day'::"PeriodType"
        AND mr."metricName" = ${metricName}
      GROUP BY date_trunc(${targetPeriodType}, mr."periodStart")::date
      ON CONFLICT ("organizationId", "repositoryId", "periodType", "periodStart", "metricName")
        WHERE "repositoryId" IS NOT NULL
      DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()
    `;
  }

  async findRepositoryOrgId(repositoryId: string): Promise<string | null> {
    const repo = await this.prisma.repository.findUnique({
      where: { id: repositoryId },
      select: { organizationId: true },
    });
    return repo?.organizationId ?? null;
  }
}
