// ============================================================================
// Deno-only shared helpers for edge functions. EXCLUDED from tsc/eslint (this
// file uses npm: specifiers and Deno globals); `supabase functions serve` and
// deploy type-check it with Deno. Keep protocol.ts / scoring.ts pure instead.
//
// The service-role client lives HERE and only here: edge functions are the
// trusted server layer the PRD routes all game writes through. The Next.js
// app itself never sees this key (CLAUDE.md hard rule).
// ============================================================================

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  acceptsAnswers,
  EVT_STATE,
  gameChannel,
  isFinalRound,
  rankStandings,
  type GameSettings,
  type PackShape,
  type PublicQuestion,
  type RevealInfo,
  type StatePayload,
  type TeamSummary,
} from "./protocol.ts";

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

// --------------------------- HTTP plumbing ----------------------------------

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function handleOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function jsonError(message: string, status: number, extra?: Record<string, unknown>): Response {
  return json({ error: message, ...extra }, status);
}

// Resolve the signed-in user from the caller's Authorization header (console
// calls carry the venue member's JWT). Returns null for anonymous callers.
export async function userFromRequest(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } }, auth: { persistSession: false } },
  );
  const { data, error } = await anon.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

// --------------------------- Realtime broadcast -----------------------------

// One HTTP call — no websocket handshake from the function (PRD perf budget:
// transitions render <300ms after broadcast; the send must be cheap).
export async function broadcast(topic: string, event: string, payload: unknown): Promise<void> {
  const url = `${Deno.env.get("SUPABASE_URL")!}/realtime/v1/api/broadcast`;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages: [{ topic, event, payload, private: false }] }),
  });
  if (!res.ok) {
    console.error(`broadcast failed: ${res.status} ${await res.text()}`);
  }
}

// --------------------------- analytics --------------------------------------

// PRD §8: taxonomy is FROZEN; server-side timestamps only. Failures are logged,
// never thrown — telemetry must not break a live game.
export async function emitEvent(
  db: SupabaseClient,
  event: string,
  ids: {
    game_id?: string;
    venue_id?: string;
    team_id?: string;
    player_id?: string;
    profile_id?: string;
  },
  props: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await db.from("analytics_events").insert({ event, ...ids, props });
  if (error) console.error(`analytics emit failed (${event}): ${error.message}`);
}

// --------------------------- projection -------------------------------------

interface GameRow {
  id: string;
  venue_id: string;
  pack_id: string;
  join_code: string;
  state: string;
  current_round: number;
  current_position: number;
  settings: GameSettings | null;
  question_deadline: string | null;
  started_at: string | null;
  ended_at: string | null;
}

export async function loadGame(db: SupabaseClient, gameId: string): Promise<GameRow | null> {
  const { data } = await db.from("games").select("*").eq("id", gameId).maybeSingle();
  return (data as GameRow | null) ?? null;
}

export async function loadGameByCode(db: SupabaseClient, code: string): Promise<GameRow | null> {
  const { data } = await db
    .from("games")
    .select("*")
    .eq("join_code", code)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as GameRow | null) ?? null;
}

export interface ShapeInfo {
  title: string;
  shape: PackShape;
}

// Pack CONTENT is immutable once a pack is live (only trivia-qa flips status,
// never questions), so the shape is safe to cache for the life of this edge
// runtime instance. Pack STATUS is deliberately NOT cached — see packIsLive.
const shapeCache = new Map<string, ShapeInfo>();

export async function packShapeFor(db: SupabaseClient, packId: string): Promise<ShapeInfo> {
  const cached = shapeCache.get(packId);
  if (cached) return cached;

  const { data: pack } = await db
    .from("packs")
    .select("title, rounds")
    .eq("id", packId)
    .maybeSingle();
  const { data: qs } = await db
    .from("pack_questions")
    .select("round, position")
    .eq("pack_id", packId);
  const rounds = (pack?.rounds as number) ?? 0;
  const positionsByRound: Record<number, number> = {};
  let hasFinal = false;
  for (const row of qs ?? []) {
    const r = row.round as number;
    if (isFinalRound(r, rounds)) hasFinal = true;
    else positionsByRound[r] = Math.max(positionsByRound[r] ?? 0, row.position as number);
  }
  const info: ShapeInfo = {
    title: (pack?.title as string) ?? "",
    shape: { rounds, positionsByRound, hasFinal },
  };
  if (pack) shapeCache.set(packId, info);
  return info;
}

// HARD RULE (PRD §4 / CLAUDE.md): packs with status != 'live' are never
// surfaced. The service role bypasses the RLS policy that enforces this for
// the API roles, so trusted code checks explicitly. Enforced at the pre-start
// boundary (join/state/start of lobby games); a pack losing 'live' MID-game
// does not kill a running night — noted product decision.
export async function packIsLive(db: SupabaseClient, packId: string): Promise<boolean> {
  const { data } = await db
    .from("packs")
    .select("status")
    .eq("id", packId)
    .maybeSingle();
  return data?.status === "live";
}

export async function currentQuestionRow(
  db: SupabaseClient,
  game: { pack_id: string; current_round: number; current_position: number },
) {
  const { data } = await db
    .from("pack_questions")
    .select("id, round, position, format, prompt, options, answer, answer_note, time_limit_s")
    .eq("pack_id", game.pack_id)
    .eq("round", game.current_round)
    .eq("position", game.current_position)
    .maybeSingle();
  return data;
}

interface TeamRow {
  id: string;
  name: string;
  score: number | string | null;
}

// Reveal payload: the ONLY projection that carries the canonical answer.
async function buildRevealInfo(
  db: SupabaseClient,
  game: GameRow,
  questionRow: Record<string, unknown>,
  teamRows: TeamRow[],
): Promise<RevealInfo> {
  const { data: answerRows } = await db
    .from("answers")
    .select("team_id, is_correct, points, payload")
    .eq("game_id", game.id)
    .eq("question_id", questionRow.id as string);
  const byTeam = new Map((answerRows ?? []).map((a) => [a.team_id as string, a]));

  // How the room voted (fun pass): per-option counts feed the TV's reveal
  // bar chart. Only choice formats have discrete options to count.
  const format = questionRow.format as string;
  let optionCounts: number[] | null = null;
  if (format === "multiple_choice") {
    const options = (questionRow.options as unknown[] | null) ?? [];
    optionCounts = new Array(options.length).fill(0);
    for (const a of answerRows ?? []) {
      const choice = (a.payload as Record<string, unknown> | null)?.choice;
      if (typeof choice === "number" && choice >= 0 && choice < optionCounts.length) {
        optionCounts[choice]++;
      }
    }
  } else if (format === "true_false") {
    optionCounts = [0, 0];
    for (const a of answerRows ?? []) {
      const choice = (a.payload as Record<string, unknown> | null)?.choice;
      if (choice === true) optionCounts[0]++;
      else if (choice === false) optionCounts[1]++;
    }
  }

  return {
    questionId: questionRow.id as string,
    answer: questionRow.answer,
    answerNote: (questionRow.answer_note as string | null) ?? null,
    optionCounts,
    teamResults: teamRows.map((t) => {
      const a = byTeam.get(t.id);
      const wagerRaw =
        a && typeof a.payload === "object" && a.payload !== null
          ? (a.payload as Record<string, unknown>).wager
          : null;
      return {
        teamId: t.id,
        name: t.name,
        answered: Boolean(a),
        isCorrect: a ? (a.is_correct as boolean | null) : null,
        points: a ? Number(a.points ?? 0) : 0,
        wager: typeof wagerRaw === "number" ? wagerRaw : null,
      };
    }),
  };
}

// Build the client-safe projection. The canonical answer ships only in the
// reveal state, via buildRevealInfo. Callers that already resolved the pack
// shape (advance-game) pass it through to avoid a duplicate lookup.
export async function buildProjection(
  db: SupabaseClient,
  game: GameRow,
  preloadedShape?: ShapeInfo,
): Promise<StatePayload> {
  const [{ title, shape }, teamsRes, playersRes] = await Promise.all([
    preloadedShape ? Promise.resolve(preloadedShape) : packShapeFor(db, game.pack_id),
    db.from("game_teams").select("id, name, score").eq("game_id", game.id),
    db.from("game_players").select("id, team_id").eq("game_id", game.id),
  ]);

  const teamRows = (teamsRes.data ?? []) as unknown as TeamRow[];
  const playerRows = playersRes.data ?? [];
  const teams: TeamSummary[] = teamRows.map((t) => ({
    id: t.id,
    name: t.name,
    playerCount: playerRows.filter((p) => p.team_id === t.id).length,
  }));

  const showQuestion =
    acceptsAnswers(game.state as never) || game.state === "locked" || game.state === "reveal";

  let question: PublicQuestion | null = null;
  let reveal: RevealInfo | null = null;

  if (showQuestion) {
    const row = await currentQuestionRow(db, game);
    if (row) {
      question = {
        id: row.id as string,
        round: game.current_round,
        position: game.current_position,
        format: row.format as PublicQuestion["format"],
        prompt: row.prompt as string,
        options: (row.options as string[] | null) ?? null,
        timeLimitS: row.time_limit_s as number,
        isFinal: isFinalRound(game.current_round, shape.rounds),
      };

      if (game.state === "reveal") {
        reveal = await buildRevealInfo(db, game, row, teamRows);
      }
    }
  }

  return {
    gameId: game.id,
    state: game.state as StatePayload["state"],
    round: game.current_round,
    position: game.current_position,
    rounds: shape.rounds,
    hasFinal: shape.hasFinal,
    deadlineTs: acceptsAnswers(game.state as never) ? game.question_deadline : null,
    serverNowTs: new Date().toISOString(),
    question,
    reveal,
    leaderboard: rankStandings(
      teamRows.map((t) => ({
        teamId: t.id,
        name: t.name,
        score: Number(t.score ?? 0),
      })),
    ),
    teams,
    playerCount: playerRows.length,
    joinCode: game.join_code,
    packTitle: title,
    settings: (game.settings ?? {}) as GameSettings,
  };
}

export async function broadcastState(
  db: SupabaseClient,
  game: GameRow,
  preloadedShape?: ShapeInfo,
): Promise<StatePayload> {
  const projection = await buildProjection(db, game, preloadedShape);
  await broadcast(gameChannel(game.id), EVT_STATE, projection);
  return projection;
}
