// The ONE way the state machine moves (PRD §5): optimistic-concurrency swap
// on the games row. Caller must be a signed-in member of the game's venue.
//
// Crash-safety of reveals: scoring is applied BEFORE the swap through the
// idempotent apply_reveal_scores RPC (one transaction; team totals recomputed
// absolutely). Die after scoring but before the swap and the game is still
// 'locked' — the retry re-scores (converging on identical values) and swaps.
// Two racing consoles both score identically; one wins the swap; the loser
// gets a clean 409.
import {
  broadcastState,
  currentQuestionRow,
  emitEvent,
  handleOptions,
  json,
  jsonError,
  loadGame,
  packIsLive,
  packShapeFor,
  serviceClient,
  userFromRequest,
} from "../_shared/deno.ts";
import {
  isFinalRound,
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
  try {
    return await handle(req);
  } catch (err) {
    console.error("advance-game crashed:", err);
    return jsonError("internal error", 500);
  }
});

async function handle(req: Request): Promise<Response> {
  const user = await userFromRequest(req);
  if (!user) return jsonError("sign in required", 401);

  let body: { gameId?: string; expectedState?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON", 400);
  }
  if (!body.gameId || !body.expectedState) return jsonError("missing fields", 400);
  if (body.action !== undefined && body.action !== "finish") {
    return jsonError("unknown action", 400);
  }

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

  const shapeInfo = await packShapeFor(db, game.pack_id);
  const { shape } = shapeInfo;
  const cur: EnginePos = {
    state: game.state as GameStateName,
    round: game.current_round,
    position: game.current_position,
  };

  // "Finish game & exit": jump straight to the podium with scores AS THEY
  // STAND (an open question's answers simply don't count). Everything after
  // is the stock podium → ended path, so game_completed still fires with real
  // duration/teams and the frozen taxonomy is untouched.
  if (body.action === "finish") {
    const finishable: GameStateName[] = [
      "round_intro", "question", "locked", "reveal", "scores", "intermission", "final_question",
    ];
    if (!finishable.includes(cur.state)) {
      return jsonError("nothing to finish from here", 422);
    }
    const { data: finished } = await db
      .from("games")
      .update({ state: "podium", question_deadline: null })
      .eq("id", game.id)
      .eq("state", cur.state)
      .eq("current_round", cur.round)
      .eq("current_position", cur.position)
      .select("*")
      .maybeSingle();
    if (!finished) return jsonError("state moved", 409);
    const projection = await broadcastState(db, finished as never, shapeInfo);
    return json({ ok: true, state: projection, enteringQuestionId: null });
  }

  const next = nextStep(cur, shape);
  if (!next) return jsonError("no legal transition from here", 422);

  // Pre-start gate for the live-pack hard rule (PRD §4): a night can only
  // START on a live pack. (Losing 'live' mid-game does not kill the night.)
  if (cur.state === "lobby" && !(await packIsLive(db, game.pack_id))) {
    return jsonError("this game's pack is not live", 422, { reason: "pack_not_live" });
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    state: next.state,
    current_round: next.round,
    current_position: next.position,
  };

  // Entering a timed state: load the question's limit and arm the clock.
  let enteringQuestionId: string | null = null;
  if (statesWithDeadline(next.state)) {
    const qRow = await currentQuestionRow(db, {
      pack_id: game.pack_id,
      current_round: next.round,
      current_position: next.position,
    });
    if (!qRow) return jsonError("pack has no question at that slot", 422);
    enteringQuestionId = qRow.id as string;
    patch.question_started_at = nowIso;
    patch.question_deadline = new Date(
      Date.now() + (qRow.time_limit_s as number) * 1000,
    ).toISOString();
  }
  if (cur.state === "lobby") patch.started_at = nowIso;
  if (next.state === "ended") patch.ended_at = nowIso;

  // ---- reveal: score idempotently BEFORE the swap ----
  let revealQuestionId: string | null = null;
  if (next.state === "reveal") {
    const qRow = await currentQuestionRow(db, {
      pack_id: game.pack_id,
      current_round: next.round,
      current_position: next.position,
    });
    if (!qRow) return jsonError("pack has no question at that slot", 422);
    revealQuestionId = qRow.id as string;

    const { data: answerRows, error: answersErr } = await db
      .from("answers")
      .select("id, team_id, payload, submitted_at")
      .eq("game_id", game.id)
      .eq("question_id", qRow.id as string);
    if (answersErr) return jsonError(`could not load answers: ${answersErr.message}`, 500);

    const isFinal = isFinalRound(next.round, shape.rounds);

    // Wager cap needs each team's score ENTERING the final. Derive it from
    // prior answers (not game_teams.score) so a reveal retry after a partial
    // failure can't feed already-applied final points back into the cap.
    let scoreBeforeByTeam = new Map<string, number>();
    if (isFinal) {
      const { data: priorRows } = await db
        .from("answers")
        .select("team_id, points")
        .eq("game_id", game.id)
        .neq("question_id", qRow.id as string)
        .not("points", "is", null);
      scoreBeforeByTeam = new Map();
      for (const row of priorRows ?? []) {
        const t = row.team_id as string;
        scoreBeforeByTeam.set(t, (scoreBeforeByTeam.get(t) ?? 0) + Number(row.points));
      }
    }

    const settings = (game.settings ?? {}) as { speed_bonus?: boolean };
    const scoringAnswers: ScoringAnswer[] = (answerRows ?? []).map((a) => ({
      teamId: a.team_id as string,
      payload: a.payload,
      submittedAtMs: Date.parse(a.submitted_at as string),
      ...(isFinal
        ? { teamScoreBefore: scoreBeforeByTeam.get(a.team_id as string) ?? 0 }
        : {}),
    }));
    const results = scoreQuestion(
      {
        format: qRow.format as never,
        answer: qRow.answer,
        timeLimitS: qRow.time_limit_s as number,
        deadlineMs: game.question_deadline ? Date.parse(game.question_deadline) : Date.now(),
        isFinal,
      },
      scoringAnswers,
      { speedBonus: settings.speed_bonus !== false },
    );

    const { error: rpcErr } = await db.rpc("apply_reveal_scores", {
      p_game_id: game.id,
      p_question_id: qRow.id as string,
      p_scores: results.map((r) => ({
        team_id: r.teamId,
        is_correct: r.isCorrect,
        points: r.points,
      })),
    });
    if (rpcErr) return jsonError(`scoring failed: ${rpcErr.message}`, 500);
  }

  // ---- optimistic concurrency swap ----
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

  // ---- analytics (emitEvent never throws) ----
  if (next.state === "reveal") {
    await emitEvent(db, "question_revealed", { game_id: game.id, venue_id: game.venue_id }, {
      question_id: revealQuestionId,
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

  const projection = await broadcastState(db, updated as never, shapeInfo);
  return json({ ok: true, state: projection, enteringQuestionId });
}
