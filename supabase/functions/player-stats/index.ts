// Post-game personal stats for the save moment (PRD §7): what THIS player
// did tonight + where their team landed. Fetching it IS the prompt, so the
// frozen account_save_prompted event emits here (server-side, once per
// player per game — resyncs must not double-count the funnel).
import {
  handleOptions,
  json,
  jsonError,
  loadGame,
  serviceClient,
} from "../_shared/deno.ts";
import { rankStandings } from "../_shared/protocol.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return jsonError("POST only", 405);
  try {
    return await handle(req);
  } catch (err) {
    console.error("player-stats crashed:", err);
    return jsonError("internal error", 500);
  }
});

async function handle(req: Request): Promise<Response> {
  let body: { gameId?: string; playerId?: string; deviceKey?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON", 400);
  }
  const { gameId, playerId, deviceKey } = body;
  if (!gameId || !playerId || !deviceKey) return jsonError("missing fields", 400);

  const db = serviceClient();
  const game = await loadGame(db, gameId);
  if (!game) return jsonError("game not found", 404);
  if (game.state !== "ended") {
    return jsonError("the night isn't over yet", 409, { reason: "not_ended" });
  }

  const { data: player } = await db
    .from("game_players")
    .select("id, team_id, display_name, profile_id")
    .eq("id", playerId)
    .eq("game_id", gameId)
    .eq("device_key", deviceKey)
    .maybeSingle();
  if (!player) return jsonError("not a player in this game", 403);

  const [{ data: teams }, { data: myAnswers }] = await Promise.all([
    db.from("game_teams").select("id, name, score").eq("game_id", gameId),
    db
      .from("answers")
      .select("is_correct, submitted_at, deadline_at, question_id, pack_questions(time_limit_s)")
      .eq("game_id", gameId)
      .eq("player_id", playerId),
  ]);

  const standings = rankStandings(
    (teams ?? []).map((t) => ({
      teamId: t.id as string,
      name: t.name as string,
      score: Number(t.score ?? 0),
    })),
  );
  const mine = standings.find((t) => t.teamId === player.team_id);

  let fastestSeconds: number | null = null;
  let correct = 0;
  for (const a of myAnswers ?? []) {
    if (a.is_correct) correct++;
    const q = a.pack_questions as unknown as { time_limit_s: number } | null;
    if (a.deadline_at && a.submitted_at && q) {
      const remaining = (Date.parse(a.deadline_at) - Date.parse(a.submitted_at)) / 1000;
      const taken = Math.max(0, q.time_limit_s - remaining);
      if (fastestSeconds === null || taken < fastestSeconds) {
        fastestSeconds = Math.round(taken * 10) / 10;
      }
    }
  }

  // The prompt fires once per player per game (frozen taxonomy, PRD §8).
  // Atomic in SQL: concurrent fetches (double-mounts, two devices) can't
  // double-count the funnel.
  const { error: promptErr } = await db.rpc("emit_account_save_prompted", {
    p_game_id: gameId,
    p_venue_id: game.venue_id,
    p_team_id: player.team_id,
    p_player_id: playerId,
  });
  if (promptErr) console.error(`save-prompt emit failed: ${promptErr.message}`);

  return json({
    displayName: player.display_name,
    alreadySaved: Boolean(player.profile_id),
    teamName: mine?.name ?? null,
    rank: mine?.rank ?? null,
    score: mine?.score ?? null,
    teamsTotal: standings.length,
    answered: (myAnswers ?? []).length,
    correct,
    fastestSeconds,
  });
}
