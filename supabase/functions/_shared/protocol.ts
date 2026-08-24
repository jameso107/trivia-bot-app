// ============================================================================
// The game protocol: state machine + wire types shared by the edge functions
// (Deno), the Next.js clients, unit tests, and the synthetic-night E2E.
// PURE module — no imports, no runtime APIs — so every runtime can load it.
// PRD §5 is the spec for the machine; PRD §7 for the projection surfaces.
// ============================================================================

export type GameStateName =
  | "lobby"
  | "round_intro"
  | "question"
  | "locked"
  | "reveal"
  | "scores"
  | "intermission"
  | "final_question"
  | "podium"
  | "ended"
  | "abandoned";

export type QuestionFormat =
  | "multiple_choice"
  | "true_false"
  | "number_closest"
  | "open_text";

// Realtime channel + event names (Postgres is truth; these are projection).
export const gameChannel = (gameId: string) => `game:${gameId}`;
export const EVT_STATE = "state"; // full StatePayload on every transition
export const EVT_TICK = "tick"; // {answeredTeams} during a question
export const EVT_LOBBY = "lobby"; // {playerCount, teams, lastJoined} in lobby

// ---------------------------------------------------------------------------
// Pack shape & transitions
// ---------------------------------------------------------------------------

// Convention (noted in M1 PR): a pack's final wager question is stored as
// round = rounds + 1, position = 1. `rounds` on the packs row counts the
// regular rounds only. THIS helper is the one place that encodes it.
export function isFinalRound(round: number, regularRounds: number): boolean {
  return round === regularRounds + 1;
}

export interface PackShape {
  rounds: number; // regular rounds (final excluded)
  positionsByRound: Record<number, number>; // round -> question count
  hasFinal: boolean;
}

export interface EnginePos {
  state: GameStateName;
  round: number;
  position: number;
}

// The single source of truth for "what comes next" (PRD §5). Returns null
// when there is no legal automatic successor (ended/abandoned, or lobby of a
// broken pack). Timing/side effects belong to the caller.
export function nextStep(cur: EnginePos, pack: PackShape): EnginePos | null {
  const { state, round, position } = cur;
  const finalRound = pack.rounds + 1;
  const isFinal = isFinalRound(round, pack.rounds);

  switch (state) {
    case "lobby":
      return pack.rounds >= 1
        ? { state: "round_intro", round: 1, position: 0 }
        : null;

    case "round_intro":
      return { state: "question", round, position: 1 };

    case "question":
      return { state: "locked", round, position };

    case "final_question":
      return { state: "locked", round, position };

    case "locked":
      return { state: "reveal", round, position };

    case "reveal": {
      if (isFinal) return { state: "podium", round, position };
      const positionsInRound = pack.positionsByRound[round] ?? 0;
      if (position < positionsInRound) {
        return { state: "question", round, position: position + 1 };
      }
      return { state: "scores", round, position };
    }

    case "scores": {
      if (round < pack.rounds) return { state: "intermission", round, position };
      if (pack.hasFinal) return { state: "final_question", round: finalRound, position: 1 };
      return { state: "podium", round, position };
    }

    case "intermission":
      return { state: "round_intro", round: round + 1, position: 0 };

    case "podium":
      return { state: "ended", round, position };

    case "ended":
    case "abandoned":
      return null;
  }
}

// States whose entry starts the question clock.
export function statesWithDeadline(state: GameStateName): boolean {
  return state === "question" || state === "final_question";
}

// States during which answers are accepted.
export function acceptsAnswers(state: GameStateName): boolean {
  return state === "question" || state === "final_question";
}

// ---------------------------------------------------------------------------
// Wire types (everything a client may see — NEVER the canonical answer
// before reveal; a bar full of engineers will open devtools)
// ---------------------------------------------------------------------------

export interface GameSettings {
  speed_bonus?: boolean; // default true (PRD §5)
  team_edits?: boolean; // default false: first answer locks
  auto_host?: boolean; // default true: the console runs the night itself (M3)
  roast_mode?: boolean; // default false (M3)
  tts_enabled?: boolean; // default false (M3)
  sponsor_slot?: boolean; // default false (M6)
  music_enabled?: boolean; // default false: synthesized console soundtrack (fun pass)
}

export interface PublicQuestion {
  id: string;
  round: number;
  position: number;
  format: QuestionFormat;
  prompt: string;
  options: string[] | null; // multiple_choice only
  timeLimitS: number;
  isFinal: boolean;
}

export interface TeamResult {
  teamId: string;
  name: string;
  answered: boolean;
  isCorrect: boolean | null;
  points: number;
  wager: number | null; // final question only
}

export interface RevealInfo {
  questionId: string;
  answer: unknown; // canonical answer, safe to show now
  answerNote: string | null; // "source: ..." — style guide requires it
  teamResults: TeamResult[];
  // How the room voted (fun pass): per-option answer counts for
  // multiple_choice (by option index) and true_false ([true, false]).
  // Optional + additive — older projections simply omit it.
  optionCounts?: number[] | null;
}

export interface TeamStanding {
  teamId: string;
  name: string;
  score: number;
  rank: number; // 1-based; ties share a rank
}

export interface TeamSummary {
  id: string;
  name: string;
  playerCount: number;
}

// The full projection broadcast on every transition and returned by
// game-state for (re)syncs. Console and player render exclusively from this.
export interface StatePayload {
  gameId: string;
  state: GameStateName;
  round: number;
  position: number;
  rounds: number; // regular rounds in the pack
  hasFinal: boolean;
  deadlineTs: string | null; // ISO; present while a question is open
  serverNowTs: string; // lets clients compute clock skew
  question: PublicQuestion | null; // question/locked/final_question/reveal
  reveal: RevealInfo | null; // reveal only
  leaderboard: TeamStanding[];
  teams: TeamSummary[];
  playerCount: number;
  joinCode: string;
  packTitle: string;
  settings: GameSettings;
}

export interface LobbyEvent {
  playerCount: number;
  teams: TeamSummary[];
  lastJoined: string | null;
}

// Consoles already know the team total from state.teams — the tick only
// carries what changes, sparing one count query per submission at rush hour.
export interface TickEvent {
  questionId: string;
  answeredTeams: number;
}

export function rankStandings(
  teams: Array<{ teamId: string; name: string; score: number }>,
): TeamStanding[] {
  const sorted = [...teams].sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name),
  );
  let lastScore: number | null = null;
  let lastRank = 0;
  return sorted.map((t, i) => {
    const rank = t.score === lastScore ? lastRank : i + 1;
    lastScore = t.score;
    lastRank = rank;
    return { ...t, rank };
  });
}
