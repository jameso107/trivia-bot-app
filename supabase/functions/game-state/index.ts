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
  serviceClient,
} from "../_shared/deno.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const url = new URL(req.url);
  const gameId = url.searchParams.get("gameId");
  const code = url.searchParams.get("code");
  if (!gameId && !code) return jsonError("pass gameId or code", 400);

  const db = serviceClient();
  const game = gameId
    ? await loadGame(db, gameId)
    : await loadGameByCode(db, code!.trim().toUpperCase());
  if (!game || game.state === "abandoned") return jsonError("game not found", 404);

  return json(await buildProjection(db, game));
});
