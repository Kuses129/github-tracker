-- CreateEnum
CREATE TYPE "BackfillRunStatus" AS ENUM ('pending', 'discovering', 'in_progress', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "BackfillTaskStatus" AS ENUM ('pending', 'fetching_prs', 'enriching', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('day', 'week', 'month');

-- AlterTable
ALTER TABLE "commits" ADD COLUMN     "backfillTaskId" UUID;

-- AlterTable
ALTER TABLE "pr_reviews" ADD COLUMN     "backfillTaskId" UUID;

-- AlterTable
ALTER TABLE "pull_requests" ADD COLUMN     "backfillTaskId" UUID;

-- AlterTable
ALTER TABLE "repositories" ADD COLUMN     "backfillTaskId" UUID;

-- CreateTable
CREATE TABLE "backfill_runs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "status" "BackfillRunStatus" NOT NULL DEFAULT 'pending',
    "totalRepos" INTEGER NOT NULL DEFAULT 0,
    "completedRepos" INTEGER NOT NULL DEFAULT 0,
    "failedRepos" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMPTZ,
    "completedAt" TIMESTAMPTZ,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "backfill_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backfill_tasks" (
    "id" UUID NOT NULL,
    "backfillRunId" UUID NOT NULL,
    "repositoryId" UUID NOT NULL,
    "status" "BackfillTaskStatus" NOT NULL DEFAULT 'pending',
    "totalPrs" INTEGER NOT NULL DEFAULT 0,
    "processedPrs" INTEGER NOT NULL DEFAULT 0,
    "failedPrs" INTEGER NOT NULL DEFAULT 0,
    "cursor" TEXT,
    "startedAt" TIMESTAMPTZ,
    "completedAt" TIMESTAMPTZ,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "backfill_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_rollups" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "repositoryId" UUID,
    "periodType" "PeriodType" NOT NULL,
    "periodStart" DATE NOT NULL,
    "metricName" TEXT NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "metric_rollups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backfill_runs_organizationId_idx" ON "backfill_runs"("organizationId");

-- CreateIndex
CREATE INDEX "backfill_runs_status_idx" ON "backfill_runs"("status");

-- CreateIndex
CREATE INDEX "backfill_tasks_backfillRunId_idx" ON "backfill_tasks"("backfillRunId");

-- CreateIndex
CREATE INDEX "backfill_tasks_repositoryId_idx" ON "backfill_tasks"("repositoryId");

-- CreateIndex
CREATE INDEX "metric_rollups_organizationId_periodType_periodStart_idx" ON "metric_rollups"("organizationId", "periodType", "periodStart");

-- CreateIndex (partial unique indexes for NULL-safe upserts on repositoryId)
CREATE UNIQUE INDEX "metric_rollups_unique_with_repo"
  ON "metric_rollups"("organizationId", "repositoryId", "periodType", "periodStart", "metricName")
  WHERE "repositoryId" IS NOT NULL;

CREATE UNIQUE INDEX "metric_rollups_unique_without_repo"
  ON "metric_rollups"("organizationId", "periodType", "periodStart", "metricName")
  WHERE "repositoryId" IS NULL;

-- CreateIndex
CREATE INDEX "metric_rollups_org_repo_period_idx"
  ON "metric_rollups"("organizationId", "repositoryId", "periodType", "periodStart");

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_backfillTaskId_fkey" FOREIGN KEY ("backfillTaskId") REFERENCES "backfill_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_backfillTaskId_fkey" FOREIGN KEY ("backfillTaskId") REFERENCES "backfill_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pr_reviews" ADD CONSTRAINT "pr_reviews_backfillTaskId_fkey" FOREIGN KEY ("backfillTaskId") REFERENCES "backfill_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commits" ADD CONSTRAINT "commits_backfillTaskId_fkey" FOREIGN KEY ("backfillTaskId") REFERENCES "backfill_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backfill_runs" ADD CONSTRAINT "backfill_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backfill_tasks" ADD CONSTRAINT "backfill_tasks_backfillRunId_fkey" FOREIGN KEY ("backfillRunId") REFERENCES "backfill_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backfill_tasks" ADD CONSTRAINT "backfill_tasks_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_rollups" ADD CONSTRAINT "metric_rollups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_rollups" ADD CONSTRAINT "metric_rollups_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
