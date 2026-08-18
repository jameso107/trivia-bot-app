// Join a game by code: create-or-pick a team, register the player, hand back
// the anonymous device credentials + a full state projection (one round trip —
// the join path owns the <10s budget, PRD §3/§7).
import {
  broadcast,
  buildProjection,
  emitEvent,
  handleOptions,
  json,
  jsonError,
  loadGameByCode,
  packIsLive,
  serviceClient,
} from "../_shared/deno.ts";
import { EVT_LOBBY, gameChannel } from "../_shared/protocol.ts";
import { cleanName } from "../_shared/moderation.ts";
import { normalizeJoinCode } from "../_shared/join-code.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return jsonError("POST only", 405);
  try {
    return await handle(req);
  } catch (err) {
    console.error("join-game crashed:", err);
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

  const code = typeof body.code === "string" ? normalizeJoinCode(body.code) : "";
  if (!code) return jsonError("missing code", 400);

  const db = serviceClient();
  const game = await loadGameByCode(db, code);
  if (!game || game.state === "abandoned") return jsonError("game not found", 404);

  // Live-pack hard rule (PRD §4), enforced pre-start: a lobby game on a
  // non-live pack does not exist as far as players are concerned.
  if (game.state === "lobby" && !(await packIsLive(db, game.pack_id))) {
    return jsonError("game not found", 404);
  }

  // Reconnect path: an existing player re-presents their device credentials.
  if (typeof body.playerId === "string" && typeof body.deviceKey === "string") {
    const { data: player } = await db
      .from("game_players")
      .select("id, team_id, display_name")
      .eq("id", body.playerId)
      .eq("game_id", game.id)
      .eq("device_key", body.deviceKey)
      .maybeSingle();
    if (player) {
      await db
        .from("game_players")
        .update({ last_seen: new Date().toISOString() })
        .eq("id", player.id);
      return json({
        gameId: game.id,
        playerId: player.id,
        teamId: player.team_id,
        deviceKey: body.deviceKey,
        displayName: player.display_name,
        rejoined: true,
        state: await buildProjection(db, game),
      });
    }
    // Credentials didn't match this game — fall through to a fresh join.
  }

  if (game.state === "ended") return jsonError("game is over", 410);

  const displayName = cleanName(body.displayName);
  if (!displayName) return jsonError("pick a different name", 422);

  // Resolve the team: an existing id, or find-or-create by name.
  let teamId: string | null = null;
  let teamCreated = false;
  if (typeof body.teamId === "string" && body.teamId) {
    const { data: team } = await db
      .from("game_teams")
      .select("id")
      .eq("id", body.teamId)
      .eq("game_id", game.id)
      .maybeSingle();
    if (!team) return jsonError("team not found", 404);
    teamId = team.id as string;
  } else {
    const teamName = cleanName(body.teamName);
    if (!teamName) return jsonError("pick a different team name", 422);
    const { data: inserted, error: insErr } = await db
      .from("game_teams")
      .insert({ game_id: game.id, name: teamName })
      .select("id")
      .maybeSingle();
    if (inserted) {
      teamId = inserted.id as string;
      teamCreated = true;
    } else if (insErr?.code === "23505") {
      // Two phones created the same team at once — join the existing one.
      const { data: existing } = await db
        .from("game_teams")
        .select("id")
        .eq("game_id", game.id)
        .eq("name", teamName)
        .maybeSingle();
      if (!existing) return jsonError("could not create team — try again", 500);
      teamId = existing.id as string;
    } else {
      return jsonError(insErr?.message ?? "could not create team", 500);
    }
  }

  const deviceKey = crypto.randomUUID();
  const { data: player, error: playerErr } = await db
    .from("game_players")
    .insert({
      game_id: game.id,
      team_id: teamId,
      display_name: displayName,
      device_key: deviceKey,
    })
    .select("id")
    .single();
  if (playerErr) return jsonError(playerErr.message, 500);

  if (teamCreated) {
    await emitEvent(db, "team_created", { game_id: game.id, venue_id: game.venue_id, team_id: teamId });
  }
  await emitEvent(db, "player_joined", {
    game_id: game.id,
    venue_id: game.venue_id,
    team_id: teamId,
    player_id: player.id as string,
  });

  const state = await buildProjection(db, game);
  await broadcast(gameChannel(game.id), EVT_LOBBY, {
    playerCount: state.playerCount,
    teams: state.teams,
    lastJoined: displayName,
  });

  return json({
    gameId: game.id,
    playerId: player.id,
    teamId,
    deviceKey,
    displayName,
    rejoined: false,
    state,
  });
}
