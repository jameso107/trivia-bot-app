// The save moment lands (PRD §7/§10 M4): a just-verified user links their
// anonymous night to a real account. Creates the profile (with
// created_from_game attribution — the QR growth loop's key metric), links
// game_players.profile_id, and emits the frozen account_created_from_game
// event exactly once. Idempotent: re-clicking the link re-confirms, never
// duplicates.
import {
  emitEvent,
  handleOptions,
  json,
  jsonError,
  loadGame,
  serviceClient,
  userFromRequest,
} from "../_shared/deno.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return jsonError("POST only", 405);
  try {
    return await handle(req);
  } catch (err) {
    console.error("complete-save crashed:", err);
    return jsonError("internal error", 500);
  }
});

async function handle(req: Request): Promise<Response> {
  const user = await userFromRequest(req);
  if (!user) return jsonError("sign in required", 401);

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

  const { data: player } = await db
    .from("game_players")
    .select("id, team_id, display_name, profile_id")
    .eq("id", playerId)
    .eq("game_id", gameId)
    .eq("device_key", deviceKey)
    .maybeSingle();
  if (!player) return jsonError("that game session doesn't match", 403);

  // Someone else's account already claimed this player slot.
  if (player.profile_id && player.profile_id !== user.id) {
    return jsonError("this player was already saved by another account", 409);
  }

  const { data: existingProfile } = await db
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  let createdProfile = false;
  if (!existingProfile) {
    const { error: insErr } = await db.from("profiles").insert({
      id: user.id,
      display_name: player.display_name,
      created_from_game: gameId, // attribution: the game that converted them
    });
    if (insErr) return jsonError(insErr.message, 500);
    createdProfile = true;
  }

  if (!player.profile_id) {
    const { error: linkErr } = await db
      .from("game_players")
      .update({ profile_id: user.id })
      .eq("id", playerId);
    if (linkErr) return jsonError(linkErr.message, 500);
  }

  if (createdProfile) {
    await emitEvent(db, "account_created_from_game", {
      game_id: gameId,
      venue_id: game.venue_id,
      team_id: player.team_id as string,
      player_id: playerId,
      profile_id: user.id,
    });
  }

  return json({ saved: true, newAccount: createdProfile });
}
