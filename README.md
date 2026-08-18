# trivia-bot-app

A bar runs a full trivia night from any computer plugged into a TV — free, no
host, ten-minute setup — while players join from their phones via QR in seconds.

- **[PRD.md](./PRD.md)** is the spec. Read it first; it wins over code.
- **[CLAUDE.md](./CLAUDE.md)** holds the hard build rules.
- Companion repos: [`trivia-bot-brain`](https://github.com/jameso107/trivia-bot-brain)
  (doctrine: question style guide, brand voice, dev workflow) and `trivia-bot-org`
  (the agent daemon that operates this product through the DB contract in PRD §9).

## Stack

Next.js (App Router, TypeScript) on Vercel · Supabase (Postgres, Auth, Realtime,
Edge Functions, Storage) · Tailwind · Vitest (unit) · Playwright (E2E) · GitHub
Actions · Sentry.

## Local development

Prereqs: Node ≥ 22, Docker Desktop running.

```bash
npm ci
npm run db:start        # local Supabase on ports 55321 (API) / 55322 (DB) / 55324 (mail UI)
cp .env.example .env.local   # then fill values from: npx supabase status
npm run dev             # http://localhost:3000
```

Local ports are moved to 55xxx on purpose so this stack never collides with
other Supabase projects on the same machine.

Auth emails (magic links) land in Mailpit: http://127.0.0.1:55324.

## Checks

```bash
npm run check       # lint + typecheck + unit — the same gate CI runs
npm run test:e2e    # Playwright against the local stack (dev server on :3100)
```

CI (`.github/workflows/ci.yml`) runs both jobs on every PR and push to main; the
E2E job boots a fresh local Supabase and runs the production build. The
synthetic-night E2E (M1) becomes the deploy gate — flaky tests are P1 bugs.

## Database & migrations

- Migrations live in `supabase/migrations/`, numbered, **additive-first**.
  Destructive changes need a decision-log entry in the brain repo first.
- `supabase/migrations/20260817000000_org_schema.sql` is a **mirror** of
  `trivia-bot-brain/infra/supabase-schema.sql` (the org owns those tables);
  change it only by changing the brain first.
- `npm run db:reset` rebuilds the local DB from migrations.
- Cloud project: `trivia-bot` (`oiwjmmnjjeodbwozbvhu`, us-east-2), shared with
  the org daemon. Apply migrations to cloud with the Supabase MCP/CLI as part
  of a release, never by hand-editing the dashboard.

### Releasing to prod — the checklist

A release is THREE deploys, not one (learned the hard way when the console
sat at "Warming up" in a real bar):

1. **App** — merging `main` auto-deploys via Vercel.
2. **SQL** — apply new `supabase/migrations/*` to the cloud project (MCP/CLI)
   and record their versions in `supabase_migrations.schema_migrations`.
3. **Edge functions** — any change under `supabase/functions/` must be
   deployed (`supabase functions deploy <name>` or the MCP
   `deploy_edge_function`, including the `_shared/*` files, `verify_jwt`
   false). The app calls these at runtime; SQL migrations do NOT ship them.

Pack content follows the §9 ritual: ingest as `qa_pending`
(`node scripts/build-seed.mjs --status qa_pending --stdout`), QA, then flip
to `live`.

## Deploy & rollback

- Vercel builds every PR into a preview deploy; `main` deploys to production.
- Env vars (Vercel project settings): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`.
  The service-role key is the daemon's and is **never** configured in the app.
- Rollback: revert the commit on `main` (preferred, keeps history honest) or
  promote the previous deployment in the Vercel dashboard; migrations are
  additive so old code runs safely against a newer schema.

## Repo map

```
supabase/migrations/   numbered schema (org mirror first, then product)
src/app/               routes: / (landing) /login /auth/* /dashboard
src/lib/supabase/      browser + server clients (anon key + RLS only)
src/lib/               pure domain logic (unit-tested)
e2e/                   Playwright specs
```
