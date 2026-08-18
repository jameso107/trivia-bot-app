// The account's reason to exist (M4): a player's nights, one place.
// User-JWT auth; reads via service role (game rows are venue-scoped under
// RLS — this is the sanctioned cross-venue view of YOUR OWN games only).
import {
  handleOptions,
  json,
  jsonError,
  serviceClient,
  userFromRequest,
} from "../_shared/deno.ts";
import { rankStandings } from "../_shared/protocol.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  try {
    return await handle(req);
  } catch (err) {
    console.error("me-stats crashed:", err);
    return jsonError("internal error", 500);
  }
});

async function handle(req: Request): Promise<Response> {
  const user = await userFromRequest(req);
  if (!user) return jsonError("sign in required", 401);

  const db = serviceClient();
  const { data: profile } = await db
    .from("profiles")
    .select("display_name, home_metro, created_at, created_from_game")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return jsonError("no profile yet — save a game first", 404);

  const { data: myPlayers } = await db
    .from("game_players")
    .select("id, game_id, team_id, display_name")
    .eq("profile_id", user.id);

  const gameIds = [...new Set((myPlayers ?? []).map((p) => p.game_id as string))];
  if (gameIds.length === 0) {
    return json({ profile, games: [], totals: { games: 0, correct: 0, wins: 0 } });
  }

  const [{ data: games }, { data: teams }, { data: myAnswers }] = await Promise.all([
    db
      .from("games")
      .select("id, created_at, state, packs(title)")
      .in("id", gameIds),
    db.from("game_teams").select("id, game_id, name, score").in("game_id", gameIds),
    db
      .from("answers")
      .select("id, is_correct")
      .in(
        "player_id",
        (myPlayers ?? []).map((p) => p.id as string),
      ),
  ]);

  const nights = (games ?? [])
    .map((g) => {
      const standings = rankStandings(
        (teams ?? [])
          .filter((t) => t.game_id === g.id)
          .map((t) => ({
            teamId: t.id as string,
            name: t.name as string,
            score: Number(t.score ?? 0),
          })),
      );
      const me = (myPlayers ?? []).find((p) => p.game_id === g.id);
      const mine = standings.find((t) => t.teamId === me?.team_id);
      return {
        gameId: g.id,
        playedAt: g.created_at,
        state: g.state,
        packTitle: (g.packs as unknown as { title: string } | null)?.title ?? "",
        teamName: mine?.name ?? null,
        rank: mine?.rank ?? null,
        score: mine?.score ?? null,
        teamsTotal: standings.length,
      };
    })
    .sort((a, b) => Date.parse(b.playedAt as string) - Date.parse(a.playedAt as string));

  const totals = {
    games: nights.length,
    correct: (myAnswers ?? []).filter((a) => a.is_correct).length,
    wins: nights.filter((n) => n.rank === 1).length,
  };

  return json({ profile, games: nights, totals });
}
