import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FnError, meStats } from "@/lib/game/api";

export const metadata = { title: "My nights — TRIVIUM" };

// Minimal /me (PRD §10 M4): the account has to be WORTH creating — your
// nights, your numbers. Streaks and leagues are post-MVP by decision.
export default async function MePage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  let stats;
  try {
    stats = await meStats(session.access_token);
  } catch (e) {
    if (e instanceof FnError && e.status === 404) {
      return (
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
          <h1 className="text-2xl font-bold">No nights saved yet</h1>
          <p className="text-zinc-400">
            Play a game and hit &quot;Save my stats&quot; when the night ends — it all
            starts counting from there.
          </p>
        </main>
      );
    }
    throw e;
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-12">
      <header>
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-400">
          TRIVIUM
        </p>
        <h1 className="text-3xl font-bold" data-testid="me-name">
          {stats.profile.display_name}
        </h1>
      </header>

      <dl className="grid grid-cols-3 gap-3 text-center" data-testid="me-totals">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <dt className="text-xs uppercase tracking-wider text-zinc-400">Nights</dt>
          <dd className="text-3xl font-black">{stats.totals.games}</dd>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <dt className="text-xs uppercase tracking-wider text-zinc-400">Correct</dt>
          <dd className="text-3xl font-black text-emerald-400">{stats.totals.correct}</dd>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <dt className="text-xs uppercase tracking-wider text-zinc-400">Wins</dt>
          <dd className="text-3xl font-black text-amber-400">{stats.totals.wins}</dd>
        </div>
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-zinc-300">Your nights</h2>
        <ul className="flex flex-col gap-2" data-testid="me-games">
          {stats.games.map((g) => (
            <li
              key={g.gameId}
              className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"
            >
              <div>
                <p className="font-semibold">{g.packTitle}</p>
                <p className="text-sm text-zinc-400">
                  {new Date(g.playedAt).toLocaleDateString()} · {g.teamName}
                </p>
              </div>
              <p className="text-right">
                <span className="text-xl font-black text-amber-400">#{g.rank}</span>
                <span className="text-sm text-zinc-400"> of {g.teamsTotal}</span>
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
