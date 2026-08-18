# Build state — handoff notes

*Updated 2026-08-17 night, after the first real bar run. Read PRD.md (spec) and
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

## Next milestones (PRD §10)

- **M4 — accounts & the save moment**: post-game phone stats (right/wrong,
  fastest answer, team result), magic-link save → `profiles` +
  `game_players.profile_id` link + `created_from_game` attribution +
  `account_created_from_game` event, minimal `/me`. Gate: E2E saves an
  account with correct attribution.
- **M5 — venue dashboard complete**: first-run wizard (fires `venue_signup_completed`
  + org `events` row), history/stats, settings toggles, custom pack request
  (comped gate), promo-kit print page, feedback + dispute capture.
  Gate: 10-minute signup→live-game E2E.
- **M6 — org integration + ads scaffolding**; **M7 — hardening/handoff**
  (150-player load, chaos pass, a11y, §9 Definition of Done).

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
