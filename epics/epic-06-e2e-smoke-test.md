# Epic 6: End-to-End Smoke Test (Week 6)

Validate the full pipeline works together on the deployed environment.

**Prerequisites:** All stories in Epic 2 (Webhook Pipeline), Epic 3 (First Metric — PRs Merged), and Epic 4 (Historical Backfill) must be complete before starting this epic.

---

## US-025: End-to-End Integration Test

Validate the full flow: GitHub App install → webhook → database → API → dashboard.

**Parallel:** After all Epic 2, 3, and 4 stories are done.

**Recommended Agents:** `devops-engineer`, `backend-developer`

---

### Implementation Details

This section describes a step-by-step manual test script for the full pipeline. Each step specifies what to do, which command or action to run, and how to verify the expected outcome.

#### Prerequisites and Environment Setup

**Test organisation and repository**

Use a dedicated GitHub organisation named `gh-tracker-smoke-test` (or a personal account if an org is not available). Create a new repository named `smoke-test-repo` inside it. This repository must be accessible to the installed GitHub App.

Ensure the following environment values are confirmed before starting:

- `DATABASE_URL` — pointing to the Railway PostgreSQL instance
- `BACKEND_URL` — the Railway-deployed NestJS service (e.g. `https://gh-tracker-api.up.railway.app`)
- `FRONTEND_URL` — the Vercel-deployed React app (e.g. `https://gh-tracker.vercel.app`)
- GitHub App Client ID and the App's installation page URL

**Local webhook forwarding (if testing locally)**

If running the backend locally rather than on Railway, use `smee.io` to forward GitHub webhook payloads:

```bash
# Install smee client globally
npm install --global smee-client

# Start forwarding — replace the channel URL with your own smee.io channel
smee --url https://smee.io/<your-channel-id> --target http://localhost:3000/webhooks/github
```

Set the GitHub App's webhook URL to the smee.io channel URL during local testing. For Railway, the webhook URL should be set directly to `https://<railway-app>.up.railway.app/webhooks/github`.

---

#### Step 1 — Install the GitHub App

1. Navigate to the GitHub App's installation page.
2. Click **Install** and select the `gh-tracker-smoke-test` organisation.
3. Grant access to **All repositories** or select `smoke-test-repo` specifically.
4. Complete the OAuth/installation flow.

**Verify — Database (Prisma Studio):**

```bash
# Open Prisma Studio against the Railway DB
DATABASE_URL="<railway-connection-string>" npx prisma studio
```

Navigate to the `Organisation` table and confirm a row exists with:
- `login` = `gh-tracker-smoke-test`
- `installationId` = (the numeric ID GitHub assigned)

Navigate to the `Repository` table and confirm `smoke-test-repo` appears linked to the org.

**Verify — Database (psql):**

```sql
SELECT id, login, installation_id, created_at
FROM organisations
WHERE login = 'gh-tracker-smoke-test';

SELECT id, name, full_name, org_id
FROM repositories
WHERE name = 'smoke-test-repo';
```

**Verify — API:**

```bash
curl -s "$BACKEND_URL/api/v1/organisations" | jq '.data[] | select(.login == "gh-tracker-smoke-test")'
```

Expected: a JSON object with `login`, `installationId`, and an array of repositories.

---

#### Step 2 — Open a Pull Request

Create a branch and open a PR against `smoke-test-repo`:

```bash
# Clone the repo
git clone https://github.com/gh-tracker-smoke-test/smoke-test-repo.git
cd smoke-test-repo

# Create a branch and push a commit
git checkout -b smoke/test-pr-01
echo "smoke test $(date)" >> smoke.txt
git add smoke.txt
git commit -m "chore: smoke test PR"
git push origin smoke/test-pr-01
```

Open the PR via GitHub UI or CLI:

```bash
gh pr create \
  --repo gh-tracker-smoke-test/smoke-test-repo \
  --title "Smoke test PR 01" \
  --body "Automated smoke test pull request." \
  --head smoke/test-pr-01 \
  --base main
```

Record the PR number returned by the command (e.g. `#1`).

**Verify — Database:**

```sql
SELECT id, number, title, state, created_at, first_commit_at
FROM pull_requests
WHERE repo_id = (SELECT id FROM repositories WHERE name = 'smoke-test-repo')
ORDER BY created_at DESC
LIMIT 5;
```

Expected: a row with `state = 'open'` and the PR title `Smoke test PR 01`.

**Verify — API:**

```bash
REPO_ID="<id from repositories table>"
curl -s "$BACKEND_URL/api/v1/repositories/$REPO_ID/pull-requests?state=open" | jq '.data[0]'
```

---

#### Step 3 — Submit a Review

```bash
gh pr review 1 \
  --repo gh-tracker-smoke-test/smoke-test-repo \
  --approve \
  --body "LGTM — smoke test review"
```

**Verify — Database:**

```sql
SELECT id, pull_request_id, state, submitted_at
FROM reviews
WHERE pull_request_id = (
  SELECT id FROM pull_requests WHERE number = 1
  AND repo_id = (SELECT id FROM repositories WHERE name = 'smoke-test-repo')
);
```

Expected: a row with `state = 'approved'` and `submitted_at` populated.

Also verify lifecycle timestamps were updated on the PR:

```sql
SELECT id, number, first_review_at, approved_at
FROM pull_requests
WHERE number = 1
AND repo_id = (SELECT id FROM repositories WHERE name = 'smoke-test-repo');
```

Expected: `first_review_at` and `approved_at` are both non-null and match the review submission time.

---

#### Step 4 — Merge the Pull Request

```bash
gh pr merge 1 \
  --repo gh-tracker-smoke-test/smoke-test-repo \
  --squash \
  --delete-branch
```

**Verify — Database:**

```sql
SELECT id, number, state, merged_at, closed_at
FROM pull_requests
WHERE number = 1
AND repo_id = (SELECT id FROM repositories WHERE name = 'smoke-test-repo');
```

Expected: `state = 'merged'`, `merged_at` is non-null, `closed_at` is non-null.

**Verify — API:**

```bash
curl -s "$BACKEND_URL/api/v1/repositories/$REPO_ID/pull-requests/1" | jq '{state, mergedAt, closedAt}'
```

---

#### Step 5 — Verify the Dashboard KPI Card and Chart

1. Open `$FRONTEND_URL` in a browser.
2. Ensure the date range filter covers today's date.
3. Locate the **PRs Merged** KPI card — the count must be at least `1`.
4. Open the bar chart — confirm a bar appears for today's date with a non-zero value.
5. Confirm the PR appears in the **Pull Requests** list page with:
   - Title: `Smoke test PR 01`
   - State badge: `merged`
   - Repository: `smoke-test-repo`

If the KPI card shows `0`, check the following before assuming a bug:

```bash
# Confirm metric_rollups has been computed for today
psql "$DATABASE_URL" -c "
  SELECT date, metric, value
  FROM metric_rollups
  WHERE date = CURRENT_DATE
  AND metric = 'prs_merged';
"
```

If no row exists, the rollup job may not have run yet. Trigger it manually:

```bash
curl -X POST "$BACKEND_URL/api/v1/admin/rollups/trigger" \
  -H "Content-Type: application/json" \
  -d '{"metric": "prs_merged", "date": "'$(date +%Y-%m-%d)'"}'
```

---

#### Step 6 — Trigger and Verify Historical Backfill

Use the backfill endpoint to pull historical PRs for the smoke test repository:

```bash
curl -X POST "$BACKEND_URL/api/v1/admin/backfill" \
  -H "Content-Type: application/json" \
  -d "{\"repositoryId\": \"$REPO_ID\", \"fromDate\": \"$(date -v-30d +%Y-%m-%d)\"}"
```

On Linux, replace `date -v-30d` with `date -d '30 days ago'`.

**Verify — pg-boss job was enqueued:**

```sql
SELECT id, name, state, created_on, completed_on
FROM pgboss.job
WHERE name = 'backfill-pull-requests'
ORDER BY created_on DESC
LIMIT 3;
```

Wait for `state = 'completed'` (poll every 10 seconds or refresh Prisma Studio).

**Verify — PRs appear in DB:**

```sql
SELECT COUNT(*) AS total_prs
FROM pull_requests
WHERE repo_id = (SELECT id FROM repositories WHERE name = 'smoke-test-repo');
```

Expected: count is greater than or equal to 1 (the smoke test PR plus any historical PRs that existed).

**Verify — Dashboard shows historical data:**

1. In the dashboard, change the date range to cover the past 30 days.
2. Confirm the bar chart shows bars for dates where PRs were merged historically.

---

#### Step 7 — Verify Filters

**Date range filter:**

1. Set the date range to a future date range (e.g. next month) — all KPI cards should show `0`.
2. Set it back to cover today — values should return.

**Repository filter:**

1. Select `smoke-test-repo` from the repository dropdown.
2. Confirm only PRs from that repository appear in the list and KPI values.
3. If a second repository exists in the org, select it — the smoke test PR must not appear.

**Verify — API filter params:**

```bash
# Filter by repo
curl -s "$BACKEND_URL/api/v1/metrics/prs-merged?repositoryId=$REPO_ID&from=2026-02-01&to=2026-02-28" | jq

# Filter by date range that excludes today — expect zero
curl -s "$BACKEND_URL/api/v1/metrics/prs-merged?from=2025-01-01&to=2025-01-31" | jq '.total'
```

---

### Testing Details

#### Approach: Manual Runbook for This Phase

This epic runs after all functional epics are complete. Automated E2E tests should be considered for the regression suite going forward, but the initial smoke test is executed as a **manual runbook** against the live deployed environment. This is intentional: the goal is to catch integration and environment-level issues that only appear in production conditions.

**Automated E2E tests (Playwright) are introduced here as a regression harness** so that every future deployment can re-run this smoke test without manual effort.

---

#### Playwright E2E Test Suite

**Framework:** Playwright
**Location:** `apps/e2e/` inside the monorepo
**Config file:** `apps/e2e/playwright.config.ts`
**Test files:**

```
apps/e2e/
  tests/
    smoke/
      01-installation.spec.ts       # Verify org + repos appear after app install
      02-webhook-pr-opened.spec.ts  # Create PR via API, verify dashboard update
      03-webhook-pr-reviewed.spec.ts
      04-webhook-pr-merged.spec.ts  # Merge PR, verify KPI card increments
      05-backfill.spec.ts           # Trigger backfill, verify chart updates
      06-filters.spec.ts            # Date range + repo filter correctness
  fixtures/
    github-api.ts                   # Helpers wrapping `gh` CLI or Octokit calls
    db.ts                           # Direct DB assertion helpers via pg client
    api.ts                          # Typed curl wrappers for the backend REST API
  playwright.config.ts
```

**Key test scenarios:**

| Test file | Scenario | Assertion method |
|---|---|---|
| `01-installation.spec.ts` | App installed on org, org row appears | DB query via `fixtures/db.ts` |
| `02-webhook-pr-opened.spec.ts` | PR opened, PR row in DB with `state=open` | DB + API response |
| `03-webhook-pr-reviewed.spec.ts` | Review submitted, `first_review_at` set | DB query |
| `04-webhook-pr-merged.spec.ts` | PR merged, KPI card shows +1 on dashboard | Playwright page assertion |
| `05-backfill.spec.ts` | Backfill job completes, chart shows history | DB row count + chart DOM |
| `06-filters.spec.ts` | Date range and repo filters return correct data | API response + UI |

**Running the suite:**

```bash
# From the monorepo root
pnpm --filter e2e exec playwright test --project=smoke

# Single test file
pnpm --filter e2e exec playwright test tests/smoke/04-webhook-pr-merged.spec.ts
```

**Environment variables required for the E2E suite:**

```
E2E_BACKEND_URL=https://gh-tracker-api.up.railway.app
E2E_FRONTEND_URL=https://gh-tracker.vercel.app
E2E_DATABASE_URL=<railway-postgres-connection-string>
E2E_GITHUB_TOKEN=<PAT with repo + admin:org scopes for smoke test org>
E2E_GITHUB_ORG=gh-tracker-smoke-test
E2E_GITHUB_REPO=smoke-test-repo
```

Store these in a `.env.e2e` file at `apps/e2e/.env.e2e` (excluded from git via `.gitignore`).

---

#### Manual Runbook Checklist

Use this checklist when running the smoke test manually against a new deployment. Check each item off in order. Do not proceed to the next step until the current one passes.

**Environment readiness**
- [ ] Confirm `BACKEND_URL` returns `200` on `GET /health`
- [ ] Confirm `FRONTEND_URL` loads the dashboard without console errors
- [ ] Confirm database connection is live (`psql "$DATABASE_URL" -c "SELECT 1"`)
- [ ] Confirm GitHub App webhook URL is set correctly in the App settings
- [ ] Confirm smee.io forwarding is active (local testing only)

**Installation**
- [ ] GitHub App installed on `gh-tracker-smoke-test` org
- [ ] `organisations` table has a row for the org with a valid `installation_id`
- [ ] `repositories` table has a row for `smoke-test-repo`

**PR opened**
- [ ] `smoke/test-pr-01` branch created and pushed
- [ ] PR opened via `gh pr create`
- [ ] `pull_requests` table has a row with `state = 'open'`
- [ ] `GET /api/v1/repositories/:id/pull-requests?state=open` returns the PR

**Review submitted**
- [ ] Review approved via `gh pr review`
- [ ] `reviews` table has a row with `state = 'approved'`
- [ ] `pull_requests.first_review_at` is non-null
- [ ] `pull_requests.approved_at` is non-null

**PR merged**
- [ ] PR merged via `gh pr merge --squash`
- [ ] `pull_requests.state = 'merged'`
- [ ] `pull_requests.merged_at` is non-null
- [ ] `GET /api/v1/repositories/:id/pull-requests/1` returns `state: "merged"`

**Dashboard validation**
- [ ] PRs Merged KPI card shows a count of at least `1`
- [ ] Bar chart has a bar for today's date
- [ ] PR appears in the Pull Requests list page with correct title and `merged` badge
- [ ] `metric_rollups` table has a row for today with `metric = 'prs_merged'` and `value >= 1`

**Backfill**
- [ ] Backfill triggered via `POST /api/v1/admin/backfill`
- [ ] pg-boss job reaches `state = 'completed'`
- [ ] PR count in DB is stable (no duplicates from backfill re-processing the same PR)
- [ ] Dashboard chart shows historical bars when date range is expanded to 30 days

**Filters**
- [ ] Date range set to a future month — all KPI cards show `0`
- [ ] Date range reset to current month — values return
- [ ] Repository filter set to `smoke-test-repo` — only its PRs appear
- [ ] Repository filter set to a different repo — smoke test PR is absent from list

**Bug documentation**
- [ ] All bugs found during the runbook are recorded in GitHub Issues with label `smoke-test-bug`
- [ ] Critical bugs (pipeline data loss, wrong metric values) are fixed before sign-off
- [ ] Non-critical cosmetic bugs are triaged into the backlog

---

#### Regression Test Strategy

Once the Playwright suite is in place, integrate it into the CI/CD pipeline so every deployment to Railway and Vercel triggers the smoke tests automatically.

**CI integration (`apps/e2e` test job in GitHub Actions):**

- Trigger: `workflow_run` on successful deployment to Railway and Vercel
- Environment: uses secrets stored in the GitHub repo for the E2E env vars
- On failure: deployment is flagged in the PR and the on-call engineer is notified
- Test report: Playwright HTML report uploaded as a GitHub Actions artifact

**Re-run policy:**

- Flaky tests must be investigated within one business day — do not mark as "known flaky" without a linked issue
- The full smoke suite must pass before any Phase 2 epic begins
- After each new webhook handler or API endpoint is added, add a corresponding test to `apps/e2e/tests/smoke/`

---

### Definition of Done

- [ ] Install the GitHub App on a test org
- [ ] Verify `installation` webhook creates org + repos in DB
- [ ] Create a PR on a test repo — verify `pull_request` webhook creates the PR in DB
- [ ] Add a review — verify `pull_request_review` webhook creates review + updates lifecycle timestamps
- [ ] Merge the PR — verify state changes to `merged`, `merged_at` set
- [ ] Dashboard shows the merged PR in the KPI card and chart
- [ ] PR appears in the pull requests list page
- [ ] Trigger backfill — verify historical PRs appear in dashboard
- [ ] Filters (date range, repository) work correctly
- [ ] Document any bugs found and fix them
