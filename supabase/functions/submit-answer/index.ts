// The answers gate (PRD §5): players never write tables — this function
// validates game state, server-clock deadline, team membership, idempotency
// (client-generated answer id), and the 3-writes rate limit, then inserts
// with a server timestamp and broadcasts an anonymized answered-count tick.
import {
  broadcast,
  emitEvent,
  handleOptions,
  json,
  jsonError,
  loadGame,
  serviceClient,
} from "../_shared/deno.ts";
import { acceptsAnswers, EVT_TICK, gameChannel } from "../_shared/protocol.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ATTEMPTS = 3;

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return jsonError("POST only", 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON", 400);
  }

  const { answerId, gameId, questionId, playerId, deviceKey, payload } = body as {
    answerId?: string;
    gameId?: string;
    questionId?: string;
    playerId?: string;
    deviceKey?: string;
    payload?: unknown;
  };

  if (!answerId || !UUID_RE.test(answerId)) return jsonError("answerId must be a uuid", 400);
  if (!gameId || !questionId || !playerId || !deviceKey) return jsonError("missing fields", 400);
  if (typeof payload !== "object" || payload === null) return jsonError("payload must be an object", 400);

  const db = serviceClient();
  const game = await loadGame(db, gameId);
  if (!game) return jsonError("game not found", 404);

  // Player identity: anonymous, but bound to this game via device_key.
  const { data: player } = await db
    .from("game_players")
    .select("id, team_id")
    .eq("id", playerId)
    .eq("game_id", gameId)
    .eq("device_key", deviceKey)
    .maybeSingle();
  if (!player) return jsonError("not a player in this game", 403);

  // Idempotent retry: the same client uuid is always a success, never a dupe.
  const { data: existingById } = await db
    .from("answers")
    .select("id")
    .eq("id", answerId)
    .maybeSingle();
  if (existingById) return json({ accepted: true, duplicate: true });

  if (!acceptsAnswers(game.state as never)) {
    return jsonError("answers are closed", 409, { reason: "not_open", state: game.state });
  }

  // Server clock is the only clock (PRD §5).
  const now = Date.now();
  if (!game.question_deadline || now > Date.parse(game.question_deadline)) {
    return jsonError("too late", 409, { reason: "too_late" });
  }

  // The submitted question must be the live one.
  const { data: liveQuestion } = await db
    .from("pack_questions")
    .select("id")
    .eq("pack_id", game.pack_id)
    .eq("round", game.current_round)
    .eq("position", game.current_position)
    .maybeSingle();
  if (!liveQuestion || liveQuestion.id !== questionId) {
    return jsonError("that question is not live", 409, { reason: "wrong_question" });
  }

  const settings = (game.settings ?? {}) as { team_edits?: boolean };

  // One answer per team per question; first locks unless team edits are on.
  const { data: teamAnswer } = await db
    .from("answers")
    .select("id, attempts, player_id")
    .eq("game_id", gameId)
    .eq("question_id", questionId)
    .eq("team_id", player.team_id)
    .maybeSingle();

  if (teamAnswer) {
    if (!settings.team_edits) {
      return jsonError("your team already answered", 409, { reason: "team_locked" });
    }
    if ((teamAnswer.attempts as number) >= MAX_ATTEMPTS) {
      return jsonError("no more edits", 429, { reason: "rate_limited" });
    }
    const { error: updErr } = await db
      .from("answers")
      .update({
        payload,
        player_id: playerId,
        submitted_at: new Date().toISOString(),
        attempts: (teamAnswer.attempts as number) + 1,
      })
      .eq("id", teamAnswer.id);
    if (updErr) return jsonError(updErr.message, 500);
  } else {
    const { error: insErr } = await db.from("answers").insert({
      id: answerId,
      game_id: gameId,
      question_id: questionId,
      team_id: player.team_id,
      player_id: playerId,
      payload,
      deadline_at: game.question_deadline,
    });
    if (insErr) {
      if (insErr.code === "23505") {
        // A teammate won the race between our check and insert.
        return jsonError("your team already answered", 409, { reason: "team_locked" });
      }
      return jsonError(insErr.message, 500);
    }
  }

  await emitEvent(db, "answer_submitted", {
    game_id: gameId,
    venue_id: game.venue_id,
    team_id: player.team_id as string,
    player_id: playerId,
  }, { question_id: questionId });

  // Anonymized tick for the console: how many teams are in, never what they said.
  const [{ count: answeredTeams }, { count: totalTeams }] = await Promise.all([
    db
      .from("answers")
      .select("id", { count: "exact", head: true })
      .eq("game_id", gameId)
      .eq("question_id", questionId),
    db
      .from("game_teams")
      .select("id", { count: "exact", head: true })
      .eq("game_id", gameId),
  ]);
  await broadcast(gameChannel(gameId), EVT_TICK, {
    questionId,
    answeredTeams: answeredTeams ?? 0,
    totalTeams: totalTeams ?? 0,
  });

  return json({ accepted: true });
});
