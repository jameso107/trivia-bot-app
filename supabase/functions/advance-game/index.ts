// The ONE way the state machine moves (PRD §5): optimistic-concurrency swap
// on the games row, side effects exactly once for the winner (scoring on
// reveal, analytics on the way), then a full-state broadcast.
// Caller must be a signed-in member of the game's venue.
import {
  broadcastState,
  emitEvent,
  handleOptions,
  json,
  jsonError,
  loadGame,
  packShapeFor,
  serviceClient,
  userFromRequest,
} from "../_shared/deno.ts";
import {
  nextStep,
  statesWithDeadline,
  type EnginePos,
  type GameStateName,
} from "../_shared/protocol.ts";
import { scoreQuestion, type ScoringAnswer } from "../_shared/scoring.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return jsonError("POST only", 405);

  const user = await userFromRequest(req);
  if (!user) return jsonError("sign in required", 401);

  let body: { gameId?: string; expectedState?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON", 400);
  }
  if (!body.gameId || !body.expectedState) return jsonError("missing fields", 400);

  const db = serviceClient();
  const game = await loadGame(db, body.gameId);
  if (!game) return jsonError("game not found", 404);

  const { data: membership } = await db
    .from("venue_members")
    .select("venue_id")
    .eq("venue_id", game.venue_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return jsonError("not a member of this venue", 403);

  if (game.state !== body.expectedState) {
    return jsonError("state moved", 409, { actual: game.state });
  }

  const { shape } = await packShapeFor(db, game.pack_id);
  const cur: EnginePos = {
    state: game.state as GameStateName,
    round: game.current_round,
    position: game.current_position,
  };
  const next = nextStep(cur, shape);
  if (!next) return jsonError("no legal transition from here", 422);

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    state: next.state,
    current_round: next.round,
    current_position: next.position,
  };

  // Entering a timed state: load the question's limit and arm the clock.
  let enteringQuestionId: string | null = null;
  if (statesWithDeadline(next.state)) {
    const { data: qRow } = await db
      .from("pack_questions")
      .select("id, time_limit_s")
      .eq("pack_id", game.pack_id)
      .eq("round", next.round)
      .eq("position", next.position)
      .maybeSingle();
    if (!qRow) return jsonError("pack has no question at that slot", 422);
    enteringQuestionId = qRow.id as string;
    patch.question_started_at = nowIso;
    patch.question_deadline = new Date(
      Date.now() + (qRow.time_limit_s as number) * 1000,
    ).toISOString();
  }
  if (cur.state === "lobby") patch.started_at = nowIso;
  if (next.state === "ended") patch.ended_at = nowIso;

  // Optimistic concurrency: only the caller who saw the current tuple wins.
  const { data: updated } = await db
    .from("games")
    .update(patch)
    .eq("id", game.id)
    .eq("state", cur.state)
    .eq("current_round", cur.round)
    .eq("current_position", cur.position)
    .select("*")
    .maybeSingle();
  if (!updated) return jsonError("state moved", 409);

  // ---- side effects, exactly once (we won the swap) ----

  if (next.state === "reveal") {
    const { data: qRow } = await db
      .from("pack_questions")
      .select("id, format, answer, time_limit_s")
      .eq("pack_id", game.pack_id)
      .eq("round", next.round)
      .eq("position", next.position)
      .single();
    const { data: answerRows } = await db
      .from("answers")
      .select("id, team_id, payload, submitted_at")
      .eq("game_id", game.id)
      .eq("question_id", qRow.id);

    const settings = (updated.settings ?? {}) as { speed_bonus?: boolean };
    const scoringAnswers: ScoringAnswer[] = (answerRows ?? []).map((a) => ({
      teamId: a.team_id as string,
      payload: a.payload,
      submittedAtMs: Date.parse(a.submitted_at as string),
    }));
    const results = scoreQuestion(
      {
        format: qRow.format as never,
        answer: qRow.answer,
        timeLimitS: qRow.time_limit_s as number,
        deadlineMs: Date.parse(updated.question_deadline as string),
        isFinal: next.round === shape.rounds + 1,
      },
      scoringAnswers,
      { speedBonus: settings.speed_bonus !== false },
    );

    const answerRowByTeam = new Map((answerRows ?? []).map((a) => [a.team_id as string, a]));
    for (const r of results) {
      const row = answerRowByTeam.get(r.teamId);
      if (!row) continue;
      await db
        .from("answers")
        .update({ is_correct: r.isCorrect, points: r.points })
        .eq("id", row.id);
      if (r.points !== 0) {
        const { data: teamRow } = await db
          .from("game_teams")
          .select("score")
          .eq("id", r.teamId)
          .single();
        await db
          .from("game_teams")
          .update({ score: Number(teamRow!.score ?? 0) + r.points })
          .eq("id", r.teamId);
      }
    }
    await emitEvent(db, "question_revealed", { game_id: game.id, venue_id: game.venue_id }, {
      question_id: qRow.id,
      round: next.round,
      position: next.position,
    });
  }

  if (cur.state === "lobby" && next.state === "round_intro") {
    await emitEvent(db, "game_started", { game_id: game.id, venue_id: game.venue_id });
  }
  if (next.state === "scores") {
    await emitEvent(db, "round_completed", { game_id: game.id, venue_id: game.venue_id }, {
      round: cur.round,
    });
  }
  if (next.state === "ended") {
    const [{ count: players }, { count: teams }] = await Promise.all([
      db.from("game_players").select("id", { count: "exact", head: true }).eq("game_id", game.id),
      db.from("game_teams").select("id", { count: "exact", head: true }).eq("game_id", game.id),
    ]);
    const questionsPlayed =
      Object.values(shape.positionsByRound).reduce((a, b) => a + b, 0) + (shape.hasFinal ? 1 : 0);
    const durationS = updated.started_at
      ? Math.round((Date.parse(nowIso) - Date.parse(updated.started_at as string)) / 1000)
      : 0;
    await emitEvent(db, "game_completed", { game_id: game.id, venue_id: game.venue_id }, {
      players: players ?? 0,
      teams: teams ?? 0,
      questions_played: questionsPlayed,
      duration_s: durationS,
    });
  }

  const projection = await broadcastState(db, updated as never);
  return json({ ok: true, state: projection, enteringQuestionId });
});
