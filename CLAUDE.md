@AGENTS.md

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
