import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { completeSave, FnError } from "@/lib/game/api";

export const metadata = { title: "Stats saved — TRIVIUM" };

// Where the save-moment magic link lands: the user is freshly verified, the
// query carries the anonymous night to claim. complete-save is idempotent, so
// refreshes and double-clicks re-confirm instead of erroring.
export default async function SaveCompletePage({
  searchParams,
}: PageProps<"/save/complete">) {
  const params = await searchParams;
  const gameId = typeof params.game === "string" ? params.game : null;
  const playerId = typeof params.player === "string" ? params.player : null;
  const deviceKey = typeof params.key === "string" ? params.key : null;

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  let outcome: { ok: true; newAccount: boolean } | { ok: false; message: string };
  if (!gameId || !playerId || !deviceKey) {
    outcome = { ok: false, message: "This link is missing its game details." };
  } else {
    try {
      const res = await completeSave({
        gameId,
        playerId,
        deviceKey,
        accessToken: session.access_token,
      });
      outcome = { ok: true, newAccount: res.newAccount };
    } catch (e) {
      outcome = {
        ok: false,
        message: e instanceof FnError ? e.message : "Something went wrong saving your night.",
      };
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-6 px-5 py-10 text-center">
      {outcome.ok ? (
        <>
          <h1 className="text-3xl font-black text-emerald-400" data-testid="save-complete">
            {outcome.newAccount ? "Account created — night saved!" : "Night saved!"}
          </h1>
          <p className="text-zinc-400">
            Tonight&apos;s result is on your record. Play anywhere TRIVIUM runs and it all
            adds up.
          </p>
          <Link
            href="/me"
            className="rounded-xl bg-amber-400 px-6 py-3 text-lg font-bold text-zinc-950"
          >
            See my stats
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-black text-red-400" data-testid="save-failed">
            Couldn&apos;t save that night
          </h1>
          <p className="text-zinc-400">{outcome.message}</p>
        </>
      )}
    </main>
  );
}
