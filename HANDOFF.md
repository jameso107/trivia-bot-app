# Build state — handoff notes

*Updated 2026-08-18, all milestones M0–M7 shipped. Read PRD.md (spec) and
CLAUDE.md (hard rules) first; this file is just "where we are."*

## Shipped and IN PRODUCTION (trivia-bot-app.vercel.app)

- **M0 pipeline**: CI (lint/types/unit + Playwright vs fresh local Supabase on
  production builds, plus `deno check` on edge functions) gates every PR.
  Vercel auto-deploys `main`. Sentry wired but dormant (DSN pending).
- **M1 game engine** (+ 15 adversarial-review fixes): server-authoritative
  state machine; 4 edge functions (join-game, submit-answer, advance-game,
  game-state); ONE pure scoring function shared by engine/tests/E2E audit;
  transactional idempotent reveals (`apply_reveal_scores`); abandoned-game
  sweep hourly via pg_cron; live-pack hard rule enforced in the trusted path.
- **M2 packs**: 3 QA'd library packs (123 questions) live in prod;
  `content/packs/*.json` → `scripts/build-seed.mjs` → seed; `create_game` RPC
  + dashboard library UI.
- **M3 auto-host**: dwell-based timing engine (cuts early when every team
  answered), 60 `host_lines` across 9 slots, staged reveal choreography, TTS
  path (dormant until audio exists), space/p manual override. Owner-accepted
  at a real bar 2026-08-17.

**The synthetic-night E2E is the deploy gate** — 8 phones, exact-score parity,
frozen §8 taxonomy audit. Flakes are P1s. Zero retries by doctrine.

## Environments

- Cloud Supabase `trivia-bot` (`oiwjmmnjjeodbwozbvhu`, us-east-2). Migrations
  0000–0600 applied + versions recorded. Owner's venue: "Pilot Venue"
  (user jamesoo@umich.edu).
- Local stack runs on **55xxx ports** on purpose (another project owns 54xxx
  on this machine). `npm run db:start`, Mailpit at :55324.
- **A release is app + SQL + edge functions** — see README's release
  checklist. Functions deploy via `supabase functions deploy` or the MCP;
  SQL migrations do NOT ship them (this stranded a real console once).

## All milestones shipped (M0–M7)

M4: save moment (stats → magic link → attributed profiles → /me).
M5: venue dashboard (wizard + org wake-up row, history, settings, custom
packs, promo kit + /v/{slug}, feedback + one-tap disputes).
M6: ads scaffolding (pick_creative/impressions, sponsor slot, house cards),
venue-health trigger, taxonomy CI gate (17 frozen events).
M7: 150-player load test (150/150 joins p95 860ms, zero drops), 3G budget
gate (prod build: 4.8s vs 10s allowed), chaos specs (console death mid-reveal,
racing advances), axe a11y gate (caught+fixed light-mode white-on-white; app
is deliberately dark-only now), 300-player join cap.

Remaining to call the §9 Definition of Done fully closed:
- ~~Org daemon dry-run~~ ✅ CLOSED 2026-08-20: trivia-bot-org built (Phase-A
  daemon, 8 roles, budgets, dry-run mode); first dry-run against production
  passed — CX consumed a real venue_signup event end-to-end, CEO computed
  KPIs from live analytics + briefed the owner, QA worked its queues.
  See github.com/jameso107/trivia-bot-org.
- Owner to-dos: Sentry DSN + NEXT_PUBLIC_SITE_URL in Vercel, Supabase Pro
  (free projects pause when idle — fatal for a bar night), custom SMTP before
  real player volume, product domain.
- M3's dwell timings and host-line copy iterate on real-night feedback.

## The org (as of 2026-08-20)

trivia-bot-org: ALL 28 registry roles runnable (OpenAI Responses agents,
per-role tool allowlists, code-enforced budgets/QA bars/outreach triple-lock).
Scheduler activates by ORG_PHASE env (A=8 agents default, B=+11, C=+7).
§9 dry-run PASSED vs prod. Org console at trivia-bot-org/web (own Vercel
project, rootDirectory=web, passcode-gated, service key server-side):
overview/agents/approvals/tasks/runs/outbox/incidents/money/funnel/company/
controls. Control plane = org_flags + agent_run_requests + outbox_records
(D-008); kill switch verified end-to-end. Daemon hosting: Railway (D-009) —
trivia-bot-org has a Dockerfile (Railway auto-detects), fetches doctrine at
boot via scripts/fetch-brain.mjs (GITHUB_TOKEN, read-only), heartbeats
org_flags.daemon_heartbeat every minute (console shows LIVE/OFFLINE). Verified
in a local container. ONE daemon at a time. Until Railway is up: `npm run
daemon` on the Mac.

## Owner to-dos (off-tool)

Vercel env: `NEXT_PUBLIC_SITE_URL`, Sentry DSN pair. Supabase Pro upgrade
(free tier pauses idle projects — fatal for a bar night). Product domain.
OpenAI account + budget cap, org mailbox, GitHub machine credential —
before the trivia-bot-org daemon build.

## Conventions that bite

- Packs with status != 'live' must never surface (enforced in RPC + RLS +
  `packIsLive` in the trusted path — keep it that way).
- Analytics event names (PRD §8) and the §9 org contract are FROZEN.
- Final wager question = round `rounds+1`, position 1; wager caps at
  min(100, team's points entering the final).
- Fixture games set `settings.auto_host=false` so specs stay deterministic.
