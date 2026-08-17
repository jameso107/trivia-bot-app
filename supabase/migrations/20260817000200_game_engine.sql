-- ============================================================================
-- M1: game engine support (additive).
--   * Server-authoritative question timing lives ON the game row so a console
--     refresh restores the clock and the answers function can reject late
--     submissions against the server's own deadline (PRD §5).
--   * answers.attempts backs the 3-writes-per-question-per-team rate limit
--     when a venue enables team edits (PRD §5 answer flow).
-- ============================================================================

alter table games
  add column question_started_at timestamptz,
  add column question_deadline timestamptz;

alter table answers
  add column attempts int not null default 1,
  -- Snapshot of the question deadline at submission time: games.question_deadline
  -- is overwritten each question, and both scoring audits (the synthetic night
  -- recomputes every score through the pure function) and answer-margin
  -- analytics need the clock each answer actually raced.
  add column deadline_at timestamptz;
