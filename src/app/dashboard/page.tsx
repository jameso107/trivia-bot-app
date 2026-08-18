import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { startGame } from "./actions";

export const metadata = { title: "Dashboard — Trivia Bot" };

// The venue dashboard, M2 shape: browse the live library, start a night.
// (First-run wizard, history, settings, promo kit: M5.) RLS means this page
// can only ever see live packs — the hard rule is enforced below this code.
export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: membership }, { data: packs }] = await Promise.all([
    supabase.from("venue_members").select("venue_id, venues(name)").limit(1).maybeSingle(),
    supabase
      .from("packs")
      .select("id, title, topic, description, question_count, rounds, tags")
      .order("title"),
  ]);

  const venueName =
    (membership?.venues as unknown as { name: string } | null)?.name ?? null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-400">
            Trivia Bot
          </p>
          <h1 className="text-3xl font-bold text-zinc-50">
            {venueName ?? "Venue dashboard"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500" data-testid="signed-in-as">
            Signed in as {user.email}
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500"
          >
            Sign out
          </button>
        </form>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-red-900 bg-red-950 px-4 py-3 text-red-300">
          {error}
        </p>
      )}

      {!membership && (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-400">
          Your account isn&apos;t attached to a venue yet. Venue setup (the
          first-run wizard) arrives with M5 — for now an operator seeds venues.
        </p>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-zinc-200">
          Pack library <span className="text-sm font-normal text-zinc-500">— free, QA&apos;d, ready tonight</span>
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="pack-library">
          {(packs ?? []).map((pack) => (
            <article
              key={pack.id}
              data-testid="pack-card"
              className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
            >
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-bold text-zinc-50">{pack.title}</h3>
                <p className="text-xs uppercase tracking-wider text-zinc-500">
                  {pack.topic} · {pack.rounds} rounds · {pack.question_count} questions
                </p>
                {pack.description && (
                  <p className="text-sm text-zinc-400">{pack.description}</p>
                )}
              </div>
              <form action={startGame.bind(null, pack.id)} className="mt-auto">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-amber-400 px-4 py-2.5 font-semibold text-zinc-950 hover:bg-amber-300"
                >
                  Start tonight&apos;s game
                </button>
              </form>
            </article>
          ))}
          {(packs ?? []).length === 0 && (
            <p className="text-zinc-500">No live packs yet — the library seeds in M2.</p>
          )}
        </div>
      </section>
    </main>
  );
}
