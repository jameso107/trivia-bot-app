// The answers gate (PRD §5): players never write tables — this function
// validates game state, server-clock deadline, team membership, idempotency
// (client-generated answer id, scoped to game/question/team), and the
// 3-writes rate limit, then inserts with a server timestamp and broadcasts an
// anonymized answered-count tick.
import {
  broadcast,
  currentQuestionRow,
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
  try {
    return await handle(req);
  } catch (err) {
    console.error("submit-answer crashed:", err);
    return jsonError("internal error", 500);
  }
});

async function handle(req: Request): Promise<Response> {
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

  // Idempotent retry: the same client uuid FOR THIS game/question/team is
  // always a success, never a dupe. Scoped so an id reused elsewhere can't
  // fake a success for a question it never answered.
  const dupCheck = () =>
    db
      .from("answers")
      .select("id")
      .eq("id", answerId)
      .eq("game_id", gameId)
      .eq("question_id", questionId)
      .eq("team_id", player.team_id as string)
      .maybeSingle();
  const { data: existingById } = await dupCheck();
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
  const liveQuestion = await currentQuestionRow(db, game);
  if (!liveQuestion || liveQuestion.id !== questionId) {
    return jsonError("that question is not live", 409, { reason: "wrong_question" });
  }

  const settings = (game.settings ?? {}) as { team_edits?: boolean };

  // One answer per team per question; first locks unless team edits are on.
  const { data: teamAnswer } = await db
    .from("answers")
    .select("id, attempts, payload")
    .eq("game_id", gameId)
    .eq("question_id", questionId)
    .eq("team_id", player.team_id)
    .maybeSingle();

  let attempt = 1;
  if (teamAnswer) {
    if (!settings.team_edits) {
      return jsonError("your team already answered", 409, { reason: "team_locked" });
    }
    // A retried edit with identical payload is a no-op success — bar wifi
    // retries must not burn attempts or move the speed-bonus timestamp.
    if (JSON.stringify(teamAnswer.payload) === JSON.stringify(payload)) {
      return json({ accepted: true, duplicate: true });
    }
    if ((teamAnswer.attempts as number) >= MAX_ATTEMPTS) {
      return jsonError("no more edits", 429, { reason: "rate_limited" });
    }
    attempt = (teamAnswer.attempts as number) + 1;
    const { error: updErr } = await db
      .from("answers")
      .update({
        payload,
        player_id: playerId,
        submitted_at: new Date().toISOString(),
        attempts: attempt,
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
        // Race between our check and the insert. Two shapes: our own id won
        // a concurrent identical retry (=> duplicate success), or a teammate
        // won the one-answer-per-team slot (=> team lock).
        const { data: nowExists } = await dupCheck();
        if (nowExists) return json({ accepted: true, duplicate: true });
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
  }, { question_id: questionId, attempt });

  // Anonymized tick: how many teams are in, never what they said. (The
  // console already knows the team total from its own state.)
  const { count: answeredTeams } = await db
    .from("answers")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId)
    .eq("question_id", questionId);
  await broadcast(gameChannel(gameId), EVT_TICK, {
    questionId,
    answeredTeams: answeredTeams ?? 0,
  });

  return json({ accepted: true });
}
