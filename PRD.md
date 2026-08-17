# Trivia Bot — Product PRD & Build Instructions

*The complete handoff document for building the Trivia Bot platform with Claude Code, structured so the finished product plugs directly into the OpenAI-agents org daemon. Owner/approver: James. Builder: Claude Code sessions on the Max plan. Version 1.0 — 2026-08-17.*

---

## How to use this document

This is three things in one: a **PRD** (what to build and why), a **technical spec** (data model, state machine, contracts — decided, not suggested), and a **build plan** (milestones M0–M7, each with acceptance gates and a copy-paste session prompt). Work milestone by milestone. Do not skip M0: the CI/test pipeline comes first because every later milestone's acceptance gate runs through it. Section 9 is the **org handoff contract** — the tables, statuses, webhooks, and event taxonomy the OpenAI daemon will operate against; treat it as a frozen API. Section 11 contains the `CLAUDE.md` to paste into the product repo root before the first session.

Companion repos: `trivia-bot-brain` (doctrine — especially `departments/trivia-ops/question-style-guide.md` and `dev-workflow.md`) and `trivia-bot-org` (the daemon, built separately per its own guide). All three share one Supabase project.

---

## 1. Product definition

**One sentence:** A bar runs a full trivia night from any computer plugged into a TV — free, no host, ten-minute setup — while players join from their phones via QR in seconds and can save their results to keep playing at home.

**The three surfaces:**

1. **Host console** (the TV): fullscreen web app driven by the bar's laptop. Lobby with join QR → timed questions → dramatic reveals → live team leaderboard → between-round screens (banter + optional sponsor/venue promo) → final podium. Runs itself (auto-host); a staff member *may* take manual control but never has to.
2. **Player app** (the phone): scan QR → enter name + team → answer in real time → see standings → post-game nudge to save stats with an email. No install, no account required to play. Join must take under 10 seconds on bar wifi.
3. **Venue dashboard** (the laptop, before/after the night): magic-link signup → create a night → pick a topic pack (library is free) or request a custom pack (premium, agent-fulfilled) → configure preferences → see history and simple analytics → promo kit assets.

**Why these constraints exist (context for build decisions):** the QR join *is* the growth loop (players become accounts); "free and self-running" is the entire sales pitch to bars (incumbents charge $150–200/night for a human host); and the org's agents — not humans — will operate the content pipeline, support, and analytics through the database contracts in §9. When a tradeoff is ambiguous, optimize in this order: **night quality → join friction → venue effort → code elegance.**

## 2. Non-goals for v1 (do not build)

No native apps (web only — decision D-003). No audio/music rounds (licensing; TTS voice lines are the only audio). No cash prizes, wagering, or sweepstakes mechanics. No programmatic ad SSP integration (sponsor/house slots only, config-driven). No Stripe billing yet (premium request flow ships with a `comped` flag; billing is a fast-follow milestone the org will file). No multi-language. No public API. No venue-to-venue tournaments. No chat between players. Anything not in this PRD needs a task row + owner approval, not improvisation.

---

## 3. Architecture (decided)

**Stack:** Next.js (App Router, TypeScript) on Vercel · Supabase (Postgres, Auth with magic links, Realtime channels, Edge Functions, Storage) · Tailwind for styling · Playwright for E2E · GitHub Actions CI · Sentry for errors. One repo (`trivia-bot-app`), one deploy. No additional services without approval.

**Core runtime pattern:** Postgres is the source of truth; Realtime is projection. The console *drives* the game state machine by calling server actions/edge functions; the server validates every transition and broadcasts state to the game's channel; players submit answers through an edge function (never direct table inserts) that validates, rate-limits, and timestamps server-side. Nothing trusts the client — a bar full of engineers *will* open devtools.

**Environments:** local (supabase CLI) → preview (Vercel preview + Supabase branch) → production. Migrations via supabase CLI, additive-first; destructive changes need a decision-log entry in the brain repo.

**Performance budgets (acceptance-tested in M7):** player join → answering in <10s on a throttled 3G profile; console state transitions render <300ms after broadcast; 150 concurrent players in one game without dropped answers; player page total JS <200KB gzipped; TV console legible from 25 feet (min font sizes specified in §6).

**Resilience (bar wifi is hostile):** players auto-reconnect and resync state on channel rejoin; answers are idempotent (client retry-safe via client-generated answer UUID); console survives a refresh mid-game (state machine restored from DB); a player who joins mid-round enters at the next question, not a broken screen.

---

## 4. Data model (product tables — spec-level SQL)

Same Supabase project as the org tables (`tasks`, `runs`, `leads`, `venues`, `approvals`, `ledger`, `kpis_daily`, `events`, `org_flags` already exist — see `trivia-bot-brain/infra/supabase-schema.sql`). The product OWNS the tables below; the org reads/writes only where §9 says so. Convert to numbered migrations in M0; RLS policies required before prod (players: no direct table access except via functions; venue users: rows scoped to their venue).

```sql
-- ============ identity ============
-- Venue owners/managers use Supabase Auth (magic link). Players are anonymous
-- by default; an account is created only at the post-game save moment.
create table profiles (              -- player accounts (post-game save)
  id uuid primary key references auth.users(id),
  display_name text not null,
  home_metro text,
  created_from_game uuid,            -- attribution: the game that converted them
  created_at timestamptz default now()
);

create table venue_members (         -- which auth users manage which venue
  venue_id uuid references venues(id),
  user_id uuid references auth.users(id),
  role text default 'owner' check (role in ('owner','staff')),
  primary key (venue_id, user_id)
);
-- NOTE: `venues` already exists in the org schema; product adds columns via migration:
--   alter table venues add column slug text unique, add column settings jsonb default '{}';

-- ============ content ============
create table packs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  topic text not null,
  description text,
  difficulty_curve numeric[] ,       -- per-round target means, e.g. {2.2,2.8,3.2,3.0}
  question_count int not null,
  rounds int not null default 4,
  source text not null default 'library' check (source in ('library','custom')),
  venue_id uuid references venues(id),          -- set for custom packs
  status text not null default 'draft'
    check (status in ('draft','qa_pending','live','retired','rejected')),
  qa_report jsonb,                   -- written by org trivia-qa agent
  tags text[] default '{}',
  created_by text not null default 'org',       -- 'org' | 'seed' | future sources
  created_at timestamptz default now()
);
-- HARD RULE (enforce in code AND with a check in queries): the product only ever
-- surfaces packs with status='live'. Only the org's trivia-qa flips qa_pending->live.

create table pack_questions (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid references packs(id) on delete cascade,
  round int not null, position int not null,
  format text not null default 'multiple_choice'
    check (format in ('multiple_choice','true_false','number_closest','open_text')),
  prompt text not null,
  options jsonb,                     -- ["a","b","c","d"] for multiple_choice
  answer jsonb not null,             -- canonical answer; for open_text include accepted variants
  answer_note text,                  -- shown at reveal ("source: ...") — required by style guide
  difficulty numeric(2,1) not null check (difficulty between 1 and 5),
  time_limit_s int not null default 30,
  unique (pack_id, round, position)
);

create table host_lines (            -- auto-host personality, data-driven (org-updatable, no deploys)
  id uuid primary key default gen_random_uuid(),
  slot text not null check (slot in ('lobby','round_intro','pre_reveal','post_reveal_correct',
    'post_reveal_brutal','intermission','final_intro','podium','close')),
  text text not null,
  tone text default 'default',       -- future: venue-selectable voice packs
  tts_audio_path text,               -- Supabase Storage path; pre-generated by org, played by console
  active boolean default true
);

create table custom_pack_requests (  -- premium feature; fulfilled by org agents
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) not null,
  topic text not null,
  notes text,
  question_count int default 40,
  status text not null default 'requested'
    check (status in ('requested','generating','qa','delivered','failed')),
  pack_id uuid references packs(id), -- set on delivery
  requested_at timestamptz default now(),
  delivered_at timestamptz
);

-- ============ live games ============
create table games (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) not null,
  pack_id uuid references packs(id) not null,
  join_code text not null unique,    -- 4-char, unambiguous alphabet (no 0/O/1/I)
  scheduled_for timestamptz,
  state text not null default 'lobby'
    check (state in ('lobby','round_intro','question','locked','reveal','scores',
                     'intermission','final_question','podium','ended','abandoned')),
  current_round int default 0, current_position int default 0,
  settings jsonb default '{}',       -- speed_bonus, roast_mode, tts_enabled, sponsor_slot, etc.
  started_at timestamptz, ended_at timestamptz,
  created_at timestamptz default now()
);

create table game_teams (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade,
  name text not null,                -- profanity-filtered, 24 chars max
  score numeric(8,2) default 0,
  unique (game_id, name)
);

create table game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade,
  team_id uuid references game_teams(id) on delete cascade,
  display_name text not null,
  profile_id uuid references profiles(id),      -- null until/unless they save
  device_key text not null,          -- anonymous session token for reconnect/idempotency
  joined_at timestamptz default now(),
  last_seen timestamptz default now()
);

create table answers (
  id uuid primary key,               -- CLIENT-GENERATED uuid => idempotent retries
  game_id uuid references games(id) on delete cascade,
  question_id uuid references pack_questions(id),
  team_id uuid references game_teams(id),
  player_id uuid references game_players(id),
  payload jsonb not null,
  submitted_at timestamptz default now(),       -- server clock only
  is_correct boolean, points numeric(6,2),      -- filled at reveal by scoring function
  unique (game_id, question_id, team_id)        -- one answer per team per question (first locks)
);
```

```sql
-- ============ feedback & quality (org-operated queues) ============
create table question_disputes (     -- the live "challenge" button
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id), question_id uuid references pack_questions(id),
  team_id uuid references game_teams(id),
  claim text,
  status text default 'open' check (status in ('open','upheld','rejected')),
  ruling_note text, ruled_at timestamptz,        -- written by org trivia-qa within 24h
  created_at timestamptz default now()
);

create table feedback (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('player','venue')),
  game_id uuid references games(id), venue_id uuid references venues(id),
  body text not null, contact_email text,
  status text default 'new' check (status in ('new','triaged','done')),
  created_at timestamptz default now()
);

-- ============ ads scaffolding (config-driven; no ad network) ============
create table ad_creatives (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('house','sponsor','venue_promo')),
  sponsor_id uuid references sponsors(id),       -- org table
  venue_id uuid references venues(id),           -- for venue_promo (premium)
  surface text not null check (surface in ('screen','phone')),
  asset_path text, headline text, body text, cta_url text,
  active boolean default true,
  created_at timestamptz default now()
);

-- ============ telemetry (the org's sensory input) ============
create table analytics_events (
  id bigint generated always as identity primary key,
  event text not null,               -- taxonomy in §8 — names are FROZEN
  game_id uuid, venue_id uuid, team_id uuid, player_id uuid, profile_id uuid,
  props jsonb default '{}',
  created_at timestamptz default now()
);
create index on analytics_events (event, created_at);
create index on analytics_events (venue_id, created_at);
```

Also required in M6: a trigger (or the game-end function) updates `venues.last_night`, `venues.nights_run`, and inserts an `events` row `{"kind":"venue_signup"}` on venue creation — that's what wakes the org's CX flow.

---

## 5. The game state machine (server-authoritative)

```
lobby ─start→ round_intro ─→ question ─(timer or host)→ locked ─→ reveal ─→
   ├─ next question in round ────────────────────────────→ question
   ├─ end of round ─→ scores ─→ (intermission if more rounds) ─→ round_intro
   └─ last round done ─→ final_question(wager) ─→ locked ─→ reveal ─→ podium ─→ ended
```

Rules the implementation must enforce: transitions happen only via one server function `advance_game(game_id, expected_state)` (optimistic concurrency — reject if state moved); every transition broadcasts `{state, round, position, deadline_ts, payload}` on channel `game:{id}`; `question → locked` fires server-side at `deadline_ts` even if the console is frozen (edge function timer or on-demand check at next interaction — implement the simple version: locked is *evaluated* lazily but answers after deadline are rejected by the answers function using the server clock); `abandoned` is auto-set on games idle >4h and excluded from all KPIs.

**Answer flow:** phone POSTs `{answer_id (client uuid), game_id, question_id, payload}` → edge function: validates game state = `question`, server time ≤ deadline, player belongs to team, rate limit (3 writes/question/team — first accepted answer locks unless settings allow team edits until lock), inserts, broadcasts an anonymized "N teams answered" tick to the console.

**Scoring (v1, deterministic):** on reveal, score = base 100 for correct + speed bonus `round(50 × time_remaining/time_limit)` if `settings.speed_bonus` (default on). `number_closest`: 100 to nearest, 50 to second. Final question: teams pre-wager 0–100 of their points; correct adds, wrong subtracts. All scoring in one pure, unit-tested function — the same function the E2E synthetic night asserts against.

## 6. The auto-host (the product bet — build it like a feature, not a screensaver)

The console must feel *hosted*: timing with intent, reveals with drama, personality between beats. Mechanics: every state has enter/exit animations and a data-driven personality line pulled from `host_lines` by slot (never hardcode lines — the org's content pipeline owns them; ship ~60 seed lines across slots, taste per `brand-voice.md`: teasing, never cruel; `roast_mode` off by default). Reveal sequence: options dim → 1.5s hold → answer highlight + `answer_note` (source) → score deltas animate on the leaderboard. If `settings.tts_enabled` and a line has `tts_audio_path`, play it (Storage-signed URL, preloaded during the prior state; silent skip on failure — audio must never block a transition).

**TV legibility (test at 1920×1080 from simulated distance):** question text ≥64px, options ≥48px, leaderboard rows ≥36px, join code ≥120px in lobby, QR min 400px with quiet zone, WCAG AA contrast on every state. The lobby screen is a billboard: QR + code + "grab your phones" + rotating player names as they join (dopamine for the room).

**Manual override:** a subtle console menu (keyboard `space`=advance, `p`=pause) so an enthusiastic bartender can drive pacing. Everything else stays automatic.

## 7. Surface specs & acceptance criteria

**Venue dashboard.** Magic-link auth → first-run wizard (venue name/metro/slug → creates `venues` row + `venue_members` + fires the signup event) → "Create a night" (pick from `live` packs with topic/difficulty filters, schedule or start now, settings toggles) → game history with per-night stats → custom pack request form (premium; v1 all venues comped, gated by `settings.premium_comped` so the flow is real before billing exists) → promo kit page (auto-filled printable flyer + social captions with the venue's QR/code — plain HTML print stylesheet, no PDF service). *Accepted when:* a new venue goes signup → first live game in under 10 minutes without help (timed in E2E).

**Player app.** Route `/j/{code}` (the QR target): name + pick-or-create team (team list live-updates) → waiting/answer/locked/reveal/standings states mirroring the console → between rounds, phone shows team standing + a single tasteful `ad_creatives` phone-surface card (house ads v1) → post-game: personal stats (right/wrong, fastest answer, team result) + "save your stats" email field → magic link creates `profiles` + links `game_players.profile_id` + fires `account_created_from_game`. *Accepted when:* throttled-3G E2E completes join→first answer <10s; reconnect mid-question resumes correctly; account save round-trips.

**Console.** Route `/host/{game_id}` (auth: venue member) → fullscreen prompt → state machine per §5–6. Sponsor slot: `settings.sponsor_slot` renders a screen-surface creative in intermission + a "brought to you by" strap on round intros (house/venue_promo v1). *Accepted when:* the full synthetic night (below) passes and a refresh at any state restores correctly.

**The synthetic night (the golden E2E, built in M1, run in CI forever):** script creates venue → pack (fixture) → game; launches console; 8 Playwright phone contexts join as 3 teams; plays 2 rounds + final wager; asserts scoring exactly matches the pure function's expected output, leaderboard order, reconnect of 1 player mid-round, and `analytics_events` rows for every event in §8. This test is the deploy gate — treat flakes as P1.

## 8. Analytics event taxonomy (FROZEN — the org's KPIs parse these names)

`venue_signup_completed`, `game_created`, `game_started`, `player_joined`, `team_created`, `answer_submitted`, `question_revealed`, `round_completed`, `game_completed` (props: players, teams, questions_played, duration_s), `game_abandoned`, `account_save_prompted`, `account_created_from_game`, `challenge_filed`, `feedback_submitted`, `custom_pack_requested`, `custom_pack_delivered`, `ad_impression` (props: creative_id, surface), `promo_kit_downloaded`. Emit exactly these from day one — `kpi-definitions.md` formulas (players_per_night, within_night_retention, qr_to_account, etc.) are computed from them by the org's analyst.

---

## 9. The org handoff contract (frozen interface — the point of this whole build)

When the product ships, the OpenAI daemon operates it *entirely through the database and one webhook*. No agent ever needs the product's UI. The contract:

| The org agent… | …operates via | Product's obligation |
|---|---|---|
| trivia-creation | INSERTs `packs` (status `qa_pending`) + `pack_questions`; claims `custom_pack_requests` | Never surface non-`live` packs; validate pack shape on read, not trust |
| trivia-qa | UPDATEs pack status `qa_pending→live/rejected` + `qa_report`; rules `question_disputes` | Reveal screens show `answer_note`; disputes filed with one tap from console |
| venue-success (CX) | Consumes `events` row on `venue_signup_completed`; reads `venues` health fields + per-venue analytics | Game-end function maintains `venues.last_night`, `nights_run`; signup fires the event row |
| user-support | Works `feedback` queue (status new→triaged→done) | Feedback capture on both surfaces with optional contact email |
| analyst | Reads `analytics_events` + product tables to write `kpis_daily` | Taxonomy in §8 exact; server-side timestamps only |
| ads-implementation / ad-sales | Manages `ad_creatives` (+ org `sponsors`) | Console/phone render active creatives per surface; `ad_impression` events fire |
| content ops (host personality) | INSERTs/updates `host_lines`, uploads TTS audio to Storage | Console pulls lines/audio at game start; no deploy needed for new lines |
| CEO / auditor | Read everything; write `tasks` for dev work | Repo stays legible: this PRD + `CLAUDE.md` current; migrations numbered |

**Handoff-complete checklist (Definition of Done for the whole build):** CI green including the synthetic night on a production-like preview; a fixture pack ingested via SQL as `qa_pending`, flipped to `live` by hand, and played end-to-end; venue signup produces the `events` row (daemon's CX cycle picks it up in dry-run); `analytics_events` populate and a sample `kpis_daily` query returns sane numbers; RLS enabled with the service role reserved for the daemon; Sentry wired; `README` runbook covers local dev, migrations, deploy, and rollback; every §7 acceptance criterion demonstrably passes. When this list is green, the company can run without its founder in the loop — that's the bar.

---

## 10. Build order — milestones with session prompts

Each milestone = one or a few Claude Code sessions. Per `dev-workflow.md`: plan before code on anything non-trivial, tests land with features, PR per milestone minimum, no red CI ever. Suggested kickoff prompt for **every** session: *"Read `PRD.md` §[relevant] and `CLAUDE.md` first. We're on milestone [MX]. Plan, then build. Stop and ask only if the PRD is ambiguous or wrong — otherwise decide and note it."*

**M0 — Pipeline before product.** Scaffold Next.js+TS+Tailwind; Supabase local via CLI; convert §4 SQL to initial migrations (+ the `venues` alter); Supabase Auth magic-link flow; GitHub Actions (lint, typecheck, unit, Playwright against local stack); Vercel preview deploys; Sentry. *Gate:* a hello-world page deploys through a green pipeline; a trivial Playwright test runs in CI.

**M1 — The game core + synthetic night.** State machine, `advance_game`, answers edge function, scoring function (unit-tested against a fixture table of edge cases), console + player minimal UIs (ugly is fine), Realtime wiring, reconnect logic, the golden E2E of §7. *Gate:* synthetic night green in CI, 8 players, exact-score assertion.

**M2 — Packs for real.** Pack/library schema live; venue "create a night" against `live` packs; seed 3 hand-written fixture packs (style-guide compliant — these also become QA test fixtures); the `qa_pending→live` gate enforced everywhere packs are read. *Gate:* E2E creates a night from the library and plays it.

**M3 — Auto-host.** Timing engine, `host_lines` slots + ~60 seed lines, reveal choreography, TV typography per §6, TTS playback path (feature-flagged; a silent no-op without audio files), manual override keys. *Gate:* a human watching a full auto-run night rates it "would play" — James, this one's your acceptance test in person.

**M4 — Accounts & the save moment.** Post-game stats screen, magic-link save, `profiles` + attribution, `account_created_from_game` event, a minimal `/me` stats page (streaks/leagues are post-MVP — the account just has to be *worth creating*). *Gate:* E2E saves an account and the attribution row is correct.

**M5 — Venue dashboard complete.** First-run wizard + signup event, history with per-night stats, settings, custom pack request flow (`comped` gate), promo kit print page, feedback + dispute capture on all surfaces. *Gate:* the 10-minute signup-to-live-game E2E.

**M6 — Org integration & ads scaffolding.** `ad_creatives` rendering both surfaces + impression events; game-end venue health updates; the `events` webhook row on signup; full §8 taxonomy audit (every event firing with correct props); RLS policies finalized. *Gate:* §9 checklist items 1–5 pass against a preview deploy with the org daemon in dry-run pointed at it.

**M7 — Hardening & handoff.** Load test (150 simulated players — k6 or Playwright swarm), throttled-network E2E profiles, accessibility pass (keyboard on dashboard, contrast on console, screen-reader labels on player app), rate limits verified, chaos pass (kill console mid-reveal, kill a player mid-answer, flip wifi), runbook README. *Gate:* the full Definition of Done in §9.

Estimated calendar: 4–6 weeks of evening/weekend sessions, M0–M1 being the heaviest. If a milestone drags past ~2× estimate, stop and re-scope with the PRD — that's a spec problem, not an effort problem.

---

## 11. `CLAUDE.md` for the product repo (paste verbatim at repo root)

```markdown
# trivia-bot-app — build rules

You are building the Trivia Bot platform. PRD.md in this repo is the spec; when code
and PRD conflict, the PRD wins; when the PRD is ambiguous, decide, note the decision
in your PR description, and keep moving. The companion `trivia-bot-brain` repo holds
doctrine — question-style-guide.md and brand-voice.md govern any content you write.

## Hard rules
- Postgres is the source of truth; Realtime is projection. Server validates everything.
  Players NEVER write tables directly — answers go through the edge function.
- Packs with status != 'live' must never be surfaced. No exceptions, including previews.
- The analytics event taxonomy (PRD §8) is frozen. Never rename, never skip an emit.
- The org handoff contract (PRD §9) is a frozen interface — schema changes to those
  tables/statuses require explicit owner approval, not a migration in passing.
- Migrations: numbered, additive-first, via supabase CLI. Destructive = ask first.
- Tests land WITH features. The synthetic-night E2E is the deploy gate; a flaky test
  is a P1 bug, not an annotation.
- No new services, paid APIs, or dependencies beyond package-lock without asking.
- Secrets in env only. Service-role key is the daemon's; the app uses anon + RLS.

## Style
- TypeScript strict; server actions/edge functions for anything stateful.
- Small components, no state libraries until pain is demonstrated.
- TV console: legibility over beauty. Player app: speed over beauty. Ship, then polish.

## Definition of done for any PR
Plan noted → code → unit/E2E updated → `npm run check` (lint+type+test) green →
PR description maps changes to PRD acceptance criteria + riskiest-part note.
```

---

## 12. Post-MVP backlog (do NOT build now — the org will file these as tasks)

Stripe billing for premium (replaces `comped`), weekly consumer league + streaks, "trivia near you" directory pages, roast-mode line packs + voice options, venue analytics deep-dive, sponsor self-serve portal, SSP integration at screen scale, image-round format, inter-bar metro championships, native app spike if consumer DAU justifies (revisit D-003).

*End of PRD. Owner sign-off on this document is the M0 start gun.*
