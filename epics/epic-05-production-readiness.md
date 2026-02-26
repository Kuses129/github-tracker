# Epic 5: Production Readiness (Week 5)

POC is proven locally. Now harden for production: CI/CD, deployment, authentication.

---

## US-022: CI/CD Pipeline

Set up GitHub Actions for lint, typecheck, build on every PR.

**Parallel:** Can run in parallel with US-023 and US-024.

**Recommended Agents:** `deployment-engineer`, `devops-engineer`

### Implementation Details

**Workflow file location:** `.github/workflows/ci.yml`

The pipeline triggers on every pull request targeting `main` and on every direct push to `main`. It runs a single job with ordered steps that mirror the local Turborepo task graph.

**Workflow YAML structure:**

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ secrets.TURBO_TEAM }}

jobs:
  ci:
    name: Lint, Typecheck, Build
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm turbo lint --cache-dir=.turbo

      - name: Typecheck
        run: pnpm turbo typecheck --cache-dir=.turbo

      - name: Build
        run: pnpm turbo build --cache-dir=.turbo
```

**Turborepo caching strategy:**

Turborepo's task graph is defined in `turbo.json`. Each task declares its `inputs` (source files, config files) and `outputs` (build artifacts). The `--cache-dir=.turbo` flag stores hashes locally inside the runner's workspace.

For remote caching, set `TURBO_TOKEN` and `TURBO_TEAM` as repository secrets. Turborepo will then reuse cached outputs from previous runs on matching input hashes, avoiding redundant work across PRs that touch unrelated workspaces.

Example `turbo.json` task definitions relevant to this pipeline:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "tsconfig*.json", "vite.config.*", "nest-cli.json"],
      "outputs": ["dist/**", ".next/**"]
    },
    "lint": {
      "inputs": ["src/**", ".eslintrc*", "eslint.config.*"]
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "tsconfig*.json"]
    }
  }
}
```

The `pnpm` cache is handled by `actions/setup-node` with `cache: pnpm`, which stores the global pnpm store keyed on the lockfile hash. Combined with Turborepo's output cache this ensures the pipeline only rebuilds changed workspaces.

**Branch protection gate:** Configure the `ci` job as a required status check on the `main` branch protection rule in repository settings. Pull requests cannot be merged unless the job passes.

### Testing Details

**Local validation with `act`:**

Install `act` (https://github.com/nektos/act) to run the workflow locally before pushing:

```bash
# Run the full CI job locally using the ubuntu-latest image
act pull_request --job ci

# Run only the lint step to iterate quickly
act pull_request --job ci --workflows .github/workflows/ci.yml
```

`act` requires a `.actrc` file or inline flags to supply secrets used by Turborepo remote caching. For local runs, omit `TURBO_TOKEN` and `TURBO_TEAM` — the pipeline must still pass using only local cache.

**What to validate:**

- The pipeline runs without the Turborepo remote cache (cold run) and completes in under 3 minutes.
- Introduce a lint error in `apps/web/src` and confirm the `lint` step exits non-zero and the job is marked failed.
- Introduce a TypeScript error and confirm the `typecheck` step fails.
- Revert the error, push again, and confirm the subsequent run uses the Turborepo cache and completes faster.
- Verify that a passing run posts a green check to the pull request status on GitHub.
- Confirm the `install` step is a cache hit (no new downloads) when the lockfile is unchanged.

### Definition of Done

- [ ] `.github/workflows/ci.yml` runs on every PR to `main`
- [ ] Pipeline steps: install → lint → typecheck → build (all workspaces)
- [ ] Pipeline uses Turborepo caching (`turbo --cache-dir`)
- [ ] Pipeline fails if any step fails
- [ ] Pipeline completes in under 3 minutes for a clean run

---

## US-023: Deployment Setup

Configure Vercel (frontend) and Railway (backend + PostgreSQL) deployments.

**Parallel:** Can run in parallel with US-022 and US-024.

**Recommended Agents:** `deployment-engineer`, `devops-engineer`

### Implementation Details

**Frontend — Vercel:**

Connect the monorepo to a Vercel project scoped to the `apps/web` workspace.

In the Vercel project settings:
- **Root directory:** `apps/web`
- **Framework preset:** Vite
- **Build command:** `cd ../.. && pnpm turbo build --filter=web`
- **Output directory:** `apps/web/dist`
- **Install command:** `pnpm install --frozen-lockfile`

Vercel's GitHub integration creates a deployment preview for every pull request branch and promotes to production on merge to `main`. No manual workflow step is required beyond the initial project connection.

Environment variables to set in Vercel (production and preview environments):
```
VITE_API_URL=https://<railway-backend-url>
VITE_NEXTAUTH_URL=https://<vercel-production-url>
```

**Backend — Railway:**

Create a Railway project with two services from the same GitHub repository.

Service 1 — PostgreSQL:
- Add the Railway PostgreSQL plugin. Railway provisions the instance and injects `DATABASE_URL` automatically into all services in the same project.

Service 2 — NestJS API:
- **Root directory:** `apps/api`
- **Build command:** `cd ../.. && pnpm install --frozen-lockfile && pnpm turbo build --filter=api`
- **Start command:** `node apps/api/dist/main.js`
- **Watch paths:** `apps/api/**`, `packages/shared/**`

Railway re-deploys the API service on every push to `main` via its GitHub integration.

**Prisma migration in deploy pipeline:**

Add a release command (or a pre-start script) so migrations run before the new API instance accepts traffic. In Railway, set the **Start command** to:

```bash
npx prisma migrate deploy && node apps/api/dist/main.js
```

`prisma migrate deploy` applies only pending migrations and is safe to run on every deploy. It reads `DATABASE_URL` from the Railway-injected environment variable.

**Environment variable management:**

All secrets are stored exclusively in the Vercel and Railway dashboards. The repository contains no `.env` files with real values. A `.env.example` file at the repo root documents every required variable without values:

```
# apps/api
DATABASE_URL=
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_WEBHOOK_SECRET=
NEXTAUTH_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# apps/web
VITE_API_URL=
VITE_NEXTAUTH_URL=
```

The `apps/api` NestJS app uses `@nestjs/config` with `ConfigService` to read all environment variables. No `process.env` references appear outside the config module.

**Health check endpoint:**

`apps/api/src/health/health.controller.ts` exposes `GET /health` returning `{ status: 'ok' }` with HTTP 200. This endpoint is unauthenticated. Railway's health check is configured to poll `/health` every 30 seconds.

### Testing Details

**Smoke test checklist — Vercel (frontend):**

After a production deployment completes:
- [ ] Navigate to the Vercel production URL in a browser. The page loads without console errors.
- [ ] The Vite bundle is served from Vercel's CDN (check response headers for `x-vercel-cache`).
- [ ] Environment variable `VITE_API_URL` is baked into the bundle and points at the Railway URL (visible in the network tab when the app makes its first API call).
- [ ] Preview deployments are generated for open pull requests.

**Smoke test checklist — Railway (backend + DB):**

After a production deployment completes:
- [ ] `curl https://<railway-url>/health` returns `{"status":"ok"}` with HTTP 200.
- [ ] Railway deployment logs show `All migrations have been successfully applied` (or `No pending migrations`) from the `prisma migrate deploy` step.
- [ ] `DATABASE_URL` is present in the Railway service's environment variable panel and is not exposed in any committed file.
- [ ] The API responds to an authenticated request from the deployed frontend (verified via browser network tab after logging in through US-024).

**Rollback verification:**

- Trigger a deploy with a deliberate error in `apps/api/src/main.ts`.
- Confirm Railway marks the deployment as failed and continues serving the previous healthy deployment.
- Revert the error, redeploy, and confirm the health check passes again.

### Definition of Done

- [ ] Frontend deploys to Vercel on merge to `main`, accessible via Vercel URL
- [ ] Backend deploys to Railway on merge to `main`, accessible via Railway URL
- [ ] Railway PostgreSQL provisioned, `DATABASE_URL` available as env var
- [ ] Prisma migrations run as part of deploy pipeline
- [ ] `GET /health` returns 200 on the deployed Railway backend
- [ ] Frontend loads in browser from Vercel URL
- [ ] Environment variables configured in both platforms (no secrets in code)

---

## US-024: GitHub OAuth Authentication

Implement GitHub OAuth login so users must authenticate before accessing the dashboard.

**Parallel:** Can run in parallel with US-022 and US-023.

**Recommended Agents:** `backend-developer`, `react-specialist`

### Implementation Details

**NextAuth.js v5 configuration:**

NextAuth.js v5 is configured inside `apps/web`. It uses the new App Router-compatible API route handler pattern.

File: `apps/web/src/auth.ts`

```typescript
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      clientId: import.meta.env.VITE_GITHUB_CLIENT_ID,
      clientSecret: import.meta.env.VITE_GITHUB_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      if (profile) {
        token.githubLogin = (profile as { login: string }).login;
        token.avatarUrl = (profile as { avatar_url: string }).avatar_url;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.githubLogin = token.githubLogin as string;
      session.user.avatarUrl = token.avatarUrl as string;
      session.accessToken = token.accessToken as string;
      return session;
    },
  },
});
```

Since this is a Vite SPA (not Next.js), NextAuth.js v5 is used in its framework-agnostic mode. The OAuth callback is handled by a thin NestJS route on the backend, and the session is maintained as a JWT stored in an `HttpOnly` cookie.

**Alternative approach for Vite SPA:** Because `apps/web` is a plain Vite React app (not a Next.js app), NextAuth.js is run server-side inside `apps/api` as a NestJS module that wraps the NextAuth.js core. The frontend receives a session JWT via a `GET /auth/session` endpoint and stores nothing sensitive in `localStorage`.

File: `apps/api/src/auth/auth.module.ts` — registers the NestJS `AuthModule` with a `GithubOAuthStrategy` (Passport.js `passport-github2`), a `JwtStrategy` for validating session cookies, and exposes:
- `GET /auth/github` — redirects to GitHub OAuth consent
- `GET /auth/github/callback` — exchanges code for token, sets `HttpOnly` session cookie, redirects to frontend
- `GET /auth/session` — returns `{ user: { login, name, avatarUrl } }` from the cookie; 401 if absent
- `POST /auth/logout` — clears the session cookie

File: `apps/api/src/auth/jwt.strategy.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.['session'],
      ]),
      secretOrKey: config.get<string>('NEXTAUTH_SECRET'),
    });
  }

  validate(payload: { sub: string; login: string; avatarUrl: string }) {
    return { userId: payload.sub, login: payload.login, avatarUrl: payload.avatarUrl };
  }
}
```

**Backend auth guard:**

File: `apps/api/src/auth/jwt-auth.guard.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

Apply globally in `apps/api/src/app.module.ts` using `APP_GUARD`, then mark `GET /health` and the OAuth endpoints as public with a `@Public()` decorator that uses `SetMetadata`.

**Frontend auth guard (React Router):**

File: `apps/web/src/auth/RequireAuth.tsx`

```typescript
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../hooks/useSession';

export function RequireAuth() {
  const { user, loading } = useSession();
  const location = useLocation();

  if (loading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}
```

All dashboard routes are nested under `<RequireAuth>` in the React Router config. The `/login` route renders the login page with the "Sign in with GitHub" button.

**Session hook:**

File: `apps/web/src/hooks/useSession.ts`

```typescript
import { useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';

interface SessionUser {
  login: string;
  name: string;
  avatarUrl: string;
}

export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get<SessionUser>('/auth/session')
      .then(({ data }) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return { user, loading };
}
```

**Top bar user display:**

The `TopBar` component reads from `useSession()` and renders `<img src={user.avatarUrl} />` and `{user.login}` alongside a logout button that calls `POST /auth/logout` then clears local state and navigates to `/login`.

**Environment variables required:**

```
# apps/api (Railway)
GITHUB_CLIENT_ID=<oauth app client id>
GITHUB_CLIENT_SECRET=<oauth app client secret>
NEXTAUTH_SECRET=<random 32-byte hex string>
NEXTAUTH_URL=https://<railway-backend-url>

# apps/web (Vercel)
VITE_API_URL=https://<railway-backend-url>
```

The GitHub OAuth App's authorization callback URL must be set to `https://<railway-backend-url>/auth/github/callback`.

### Testing Details

**Unit tests — backend auth guard:**

File: `apps/api/src/auth/jwt-auth.guard.spec.ts`

Test that `JwtAuthGuard` rejects requests with:
- No cookie → `401 Unauthorized`
- Malformed JWT → `401 Unauthorized`
- Expired JWT → `401 Unauthorized`
- Valid JWT signed with wrong secret → `401 Unauthorized`
- Valid JWT → passes through and populates `request.user`

Use NestJS `Test.createTestingModule()` with a mock `ConfigService` returning a known test secret. Sign test JWTs with `jsonwebtoken` directly.

```typescript
it('rejects a request with no session cookie', async () => {
  const response = await request(app.getHttpServer())
    .get('/api/prs/merged')
    .expect(401);
  expect(response.body.message).toBe('Unauthorized');
});
```

**Unit tests — frontend RequireAuth:**

File: `apps/web/src/auth/RequireAuth.test.tsx`

Mock `useSession` to return `{ user: null, loading: false }` and confirm the component renders `<Navigate to="/login" />`. Mock it to return a valid user and confirm `<Outlet />` is rendered.

**Integration tests — login flow:**

Use Vitest + React Testing Library + MSW (Mock Service Worker) to intercept API calls.

Mock `GET /auth/session` to return `401` on first load, confirm the user is redirected to `/login`. Then mock it to return a valid session object, re-render, and confirm the top bar shows the user's avatar and login.

MSW handler example:
```typescript
http.get('/auth/session', () => {
  return HttpResponse.json({ user: { login: 'testuser', name: 'Test User', avatarUrl: 'https://example.com/avatar.png' } });
})
```

**End-to-end OAuth flow (manual smoke test on staging):**

- [ ] Navigate to the deployed Vercel URL while unauthenticated. Confirm redirect to `/login`.
- [ ] Click "Sign in with GitHub". Confirm redirect to `github.com/login/oauth/authorize`.
- [ ] Authorize the app. Confirm redirect back to the dashboard with the user's avatar and GitHub login visible in the top bar.
- [ ] Open a new tab in private browsing and navigate to a dashboard route. Confirm redirect to `/login` (session is not shared across origins, cookie is `HttpOnly`).
- [ ] Click Logout. Confirm the session cookie is cleared and the browser redirects to `/login`.
- [ ] Make a direct `curl` call to a protected API endpoint without the session cookie. Confirm `401` is returned.

### Definition of Done

- [ ] NextAuth.js v5 configured with GitHub OAuth provider
- [ ] Login page with "Sign in with GitHub" button
- [ ] Successful OAuth redirects to dashboard, session persisted
- [ ] Auth guard on backend API rejects unauthenticated requests with 401
- [ ] Auth guard on frontend redirects unauthenticated users to login page
- [ ] User's GitHub avatar and name displayed in the top bar after login
- [ ] Logout button clears session and redirects to login
