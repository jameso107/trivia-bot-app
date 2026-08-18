// Resync endpoint: full sanitized projection by game id or join code.
// Consoles restore from it after a refresh; players after a reconnect;
// the join form uses it (by code) to show live team lists (PRD §3 resilience).
import {
  buildProjection,
  handleOptions,
  json,
  jsonError,
  loadGame,
  loadGameByCode,
  packIsLive,
  serviceClient,
} from "../_shared/deno.ts";
import { normalizeJoinCode } from "../_shared/join-code.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  try {
    return await handle(req);
  } catch (err) {
    console.error("game-state crashed:", err);
    return jsonError("internal error", 500);
  }
});

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const gameId = url.searchParams.get("gameId");
  const code = url.searchParams.get("code");
  if (!gameId && !code) return jsonError("pass gameId or code", 400);

  const db = serviceClient();
  const game = gameId
    ? await loadGame(db, gameId)
    : await loadGameByCode(db, normalizeJoinCode(code!));
  if (!game || game.state === "abandoned") return jsonError("game not found", 404);

  // Live-pack hard rule (PRD §4), enforced pre-start — mirrors join-game.
  if (game.state === "lobby" && !(await packIsLive(db, game.pack_id))) {
    return jsonError("game not found", 404);
  }

  return json(await buildProjection(db, game));
}
