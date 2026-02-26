-- CreateEnum
CREATE TYPE "PrState" AS ENUM ('draft', 'open', 'closed', 'merged');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "githubId" BIGINT NOT NULL,
    "login" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repositories" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "githubId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contributors" (
    "id" UUID NOT NULL,
    "githubId" BIGINT NOT NULL,
    "login" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "contributors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pull_requests" (
    "id" UUID NOT NULL,
    "repositoryId" UUID NOT NULL,
    "authorId" UUID,
    "githubId" BIGINT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "state" "PrState" NOT NULL,
    "additions" INTEGER NOT NULL DEFAULT 0,
    "deletions" INTEGER NOT NULL DEFAULT 0,
    "changedFiles" INTEGER NOT NULL DEFAULT 0,
    "githubCreatedAt" TIMESTAMPTZ NOT NULL,
    "firstCommitAt" TIMESTAMPTZ,
    "firstReviewAt" TIMESTAMPTZ,
    "approvedAt" TIMESTAMPTZ,
    "mergedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "pull_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pr_reviewers" (
    "id" UUID NOT NULL,
    "pullRequestId" UUID NOT NULL,
    "contributorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pr_reviewers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pr_reviews" (
    "id" UUID NOT NULL,
    "pullRequestId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "githubId" BIGINT NOT NULL,
    "state" TEXT NOT NULL,
    "submittedAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pr_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commits" (
    "id" UUID NOT NULL,
    "repositoryId" UUID NOT NULL,
    "authorId" UUID,
    "sha" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "committedAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pull_request_commits" (
    "id" UUID NOT NULL,
    "pullRequestId" UUID NOT NULL,
    "commitId" UUID NOT NULL,

    CONSTRAINT "pull_request_commits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_githubId_key" ON "organizations"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_login_key" ON "organizations"("login");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_githubId_key" ON "repositories"("githubId");

-- CreateIndex
CREATE INDEX "repositories_organizationId_idx" ON "repositories"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "contributors_githubId_key" ON "contributors"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "contributors_login_key" ON "contributors"("login");

-- CreateIndex
CREATE INDEX "pull_requests_repositoryId_mergedAt_idx" ON "pull_requests"("repositoryId", "mergedAt");

-- CreateIndex
CREATE UNIQUE INDEX "pull_requests_repositoryId_number_key" ON "pull_requests"("repositoryId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "pr_reviewers_pullRequestId_contributorId_key" ON "pr_reviewers"("pullRequestId", "contributorId");

-- CreateIndex
CREATE UNIQUE INDEX "pr_reviews_githubId_key" ON "pr_reviews"("githubId");

-- CreateIndex
CREATE INDEX "pr_reviews_reviewerId_submittedAt_idx" ON "pr_reviews"("reviewerId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "commits_sha_key" ON "commits"("sha");

-- CreateIndex
CREATE INDEX "commits_repositoryId_committedAt_idx" ON "commits"("repositoryId", "committedAt");

-- CreateIndex
CREATE UNIQUE INDEX "pull_request_commits_pullRequestId_commitId_key" ON "pull_request_commits"("pullRequestId", "commitId");

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "contributors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pr_reviewers" ADD CONSTRAINT "pr_reviewers_pullRequestId_fkey" FOREIGN KEY ("pullRequestId") REFERENCES "pull_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pr_reviewers" ADD CONSTRAINT "pr_reviewers_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "contributors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pr_reviews" ADD CONSTRAINT "pr_reviews_pullRequestId_fkey" FOREIGN KEY ("pullRequestId") REFERENCES "pull_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pr_reviews" ADD CONSTRAINT "pr_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "contributors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commits" ADD CONSTRAINT "commits_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commits" ADD CONSTRAINT "commits_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "contributors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pull_request_commits" ADD CONSTRAINT "pull_request_commits_pullRequestId_fkey" FOREIGN KEY ("pullRequestId") REFERENCES "pull_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pull_request_commits" ADD CONSTRAINT "pull_request_commits_commitId_fkey" FOREIGN KEY ("commitId") REFERENCES "commits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
