import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  requestCustomPack,
  retireVenuePack,
  startGame,
  submitVenueFeedback,
  updateVenueSettings,
} from "./actions";
import { FirstRunWizard } from "./wizard";

export const metadata = { title: "Dashboard — TRIVIUM" };

interface Night {
  game_id: string;
  created_at: string;
  state: string;
  pack_title: string;
  join_code: string;
  players: number;
  teams: number;
  winner: string | null;
  duration_s: number | null;
}

const TOGGLES: Array<{ key: string; label: string; hint: string; default: boolean }> = [
  { key: "auto_host", label: "Auto-host", hint: "the console runs the night itself", default: true },
  { key: "speed_bonus", label: "Speed bonus", hint: "faster correct answers score more", default: true },
  { key: "team_edits", label: "Team answer edits", hint: "teams can change answers until lock (3 max)", default: false },
  { key: "tts_enabled", label: "Host voice (TTS)", hint: "plays host lines aloud when audio exists", default: false },
  { key: "music_enabled", label: "Music", hint: "synthesized soundtrack from the TV — lobby groove, question tension, podium fanfare ('m' mutes live)", default: false },
];

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const notice =
    params.welcome === "1"
      ? "Venue created — pick a pack and you're live."
      : params.saved === "1"
        ? "Settings saved."
        : params.requested === "1"
          ? "Custom pack requested — it lands in your library once it clears QA."
          : params.feedback === "sent"
            ? "Feedback sent — thank you."
            : params.published === "1"
              ? "Your pack is live — it's in your library below, ready to start tonight."
              : params.retired === "1"
                ? "Pack retired — past nights keep their history."
                : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("venue_members")
    .select("venue_id, venues(id, name, metro, slug, settings)")
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-12">
        <header>
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-400">
            TRIVIUM
          </p>
          <h1 className="text-3xl font-bold text-zinc-50">Welcome</h1>
          <p className="mt-1 text-sm text-zinc-400" data-testid="signed-in-as">
            Signed in as {user.email}
          </p>
        </header>
        <FirstRunWizard error={error} />
      </main>
    );
  }

  const venue = membership.venues as unknown as {
    id: string;
    name: string;
    metro: string | null;
    slug: string | null;
    settings: Record<string, unknown> | null;
  };
  const settings = venue.settings ?? {};

  const [{ data: packs }, { data: historyRaw }, { data: requests }] = await Promise.all([
    supabase
      .from("packs")
      .select("id, title, topic, description, question_count, rounds, tags, venue_id, status")
      .order("title"),
    supabase.rpc("venue_history"),
    supabase
      .from("custom_pack_requests")
      .select("id, topic, status, requested_at")
      .order("requested_at", { ascending: false })
      .limit(5),
  ]);
  const nights = (historyRaw ?? []) as unknown as Night[];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-400">
            TRIVIUM
          </p>
          <h1 className="text-3xl font-bold text-zinc-50" data-testid="venue-name">
            {venue.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-400" data-testid="signed-in-as">
            {venue.metro} · /v/{venue.slug} · {user.email}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/promo"
            className="rounded-lg border border-amber-500 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-950"
          >
            Promo kit
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-red-900 bg-red-950 px-4 py-3 text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-emerald-900 bg-emerald-950 px-4 py-3 text-emerald-300" data-testid="notice">
          {notice}
        </p>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-zinc-200">
          Your packs{" "}
          <span className="text-sm font-normal text-zinc-400">
            — written by you, visible only to your venue
          </span>
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="own-packs">
          {(packs ?? [])
            .filter((p) => p.venue_id !== null)
            .filter((p) => p.status !== "retired")
            .map((pack) => (
              <article
                key={pack.id}
                data-testid="own-pack-card"
                className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-bold text-zinc-50">{pack.title}</h3>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        pack.status === "live"
                          ? "border-emerald-800 text-emerald-400"
                          : "border-amber-800 text-amber-300"
                      }`}
                    >
                      {pack.status}
                    </span>
                  </div>
                  <p className="text-xs uppercase tracking-wider text-zinc-400">
                    {pack.topic} · {pack.question_count} questions
                  </p>
                </div>
                {pack.status === "live" ? (
                  <div className="mt-auto flex gap-2">
                    <form action={startGame.bind(null, pack.id)} className="flex-1">
                      <button
                        type="submit"
                        className="w-full rounded-xl bg-amber-400 px-4 py-2.5 font-semibold text-zinc-950 hover:bg-amber-300"
                      >
                        Start tonight&apos;s game
                      </button>
                    </form>
                    <form action={retireVenuePack.bind(null, pack.id)}>
                      <button
                        type="submit"
                        className="rounded-xl border border-zinc-700 px-3 py-2.5 text-sm text-zinc-400 hover:border-red-800 hover:text-red-400"
                        title="Retire this pack"
                      >
                        Retire
                      </button>
                    </form>
                  </div>
                ) : (
                  <Link
                    href={`/dashboard/create?pack=${pack.id}`}
                    className="mt-auto rounded-xl border border-zinc-600 px-4 py-2.5 text-center font-semibold text-zinc-200 hover:border-amber-400"
                  >
                    Keep editing
                  </Link>
                )}
              </article>
            ))}
          <Link
            href="/dashboard/create"
            data-testid="create-pack-cta"
            className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-700 p-5 text-center hover:border-amber-400"
          >
            <span className="text-3xl text-amber-400">+</span>
            <span className="font-semibold text-zinc-200">Create your own pack</span>
            <span className="text-xs text-zinc-400">
              your bar, your inside jokes — five questions minimum
            </span>
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-zinc-200">
          TRIVIUM library{" "}
          <span className="text-sm font-normal text-zinc-400">— free, QA&apos;d, ready tonight</span>
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="pack-library">
          {(packs ?? [])
            .filter((p) => p.venue_id === null)
            .map((pack) => (
            <article
              key={pack.id}
              data-testid="pack-card"
              className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
            >
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-bold text-zinc-50">{pack.title}</h3>
                <p className="text-xs uppercase tracking-wider text-zinc-400">
                  {pack.topic} · {pack.rounds} rounds · {pack.question_count} questions
                </p>
                {pack.description && <p className="text-sm text-zinc-400">{pack.description}</p>}
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
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-zinc-200">Recent nights</h2>
        {nights.length === 0 ? (
          <p className="text-sm text-zinc-400">No nights yet — your history builds here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="night-history">
              <thead className="text-xs uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Pack</th>
                  <th className="py-2 pr-4">Players</th>
                  <th className="py-2 pr-4">Teams</th>
                  <th className="py-2 pr-4">Winner</th>
                  <th className="py-2 pr-4">Length</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {nights.map((n) => (
                  <tr key={n.game_id} className="border-t border-zinc-800">
                    <td className="py-2 pr-4">{new Date(n.created_at).toLocaleDateString()}</td>
                    <td className="py-2 pr-4">{n.pack_title}</td>
                    <td className="py-2 pr-4">{n.players}</td>
                    <td className="py-2 pr-4">{n.teams}</td>
                    <td className="py-2 pr-4">{n.winner ?? "—"}</td>
                    <td className="py-2 pr-4">
                      {n.duration_s ? `${Math.round(n.duration_s / 60)}m` : "—"}
                    </td>
                    <td className="py-2">
                      {n.state === "ended" ? (
                        n.state
                      ) : n.state === "abandoned" ? (
                        <span className="text-zinc-400">{n.state}</span>
                      ) : (
                        <Link className="text-amber-400 underline" href={`/host/${n.game_id}`}>
                          {n.state} → console
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold text-zinc-200">Night settings</h2>
          <form
            action={updateVenueSettings.bind(null, venue.id)}
            className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
            data-testid="settings-form"
          >
            {TOGGLES.map((t) => (
              <label key={t.key} className="flex items-start gap-3 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  name={t.key}
                  defaultChecked={
                    typeof settings[t.key] === "boolean" ? (settings[t.key] as boolean) : t.default
                  }
                  className="mt-0.5 h-4 w-4 accent-amber-400"
                />
                <span>
                  <span className="font-semibold text-zinc-200">{t.label}</span>
                  <span className="block text-xs text-zinc-400">{t.hint}</span>
                </span>
              </label>
            ))}
            <button
              type="submit"
              className="mt-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-amber-400"
            >
              Save defaults
            </button>
          </form>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold text-zinc-200">
            Custom pack{" "}
            <span className="rounded-full border border-emerald-800 px-2 py-0.5 text-xs text-emerald-400">
              premium — comped
            </span>
          </h2>
          <form
            action={requestCustomPack}
            className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
            data-testid="custom-pack-form"
          >
            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              Topic
              <input
                name="topic"
                required
                maxLength={120}
                placeholder="'90s Detroit sports"
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              Notes (optional)
              <textarea
                name="notes"
                rows={2}
                maxLength={500}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-50"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950"
            >
              Request pack
            </button>
            {(requests ?? []).length > 0 && (
              <ul className="mt-1 flex flex-col gap-1 text-xs text-zinc-400" data-testid="request-list">
                {(requests ?? []).map((r) => (
                  <li key={r.id}>
                    “{r.topic}” — <span className="text-amber-300">{r.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </form>

          <form
            action={submitVenueFeedback}
            className="flex flex-col gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
            data-testid="venue-feedback-form"
          >
            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              Tell us anything
              <textarea
                name="body"
                required
                rows={2}
                maxLength={2000}
                placeholder="What worked? What flopped?"
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-50"
              />
            </label>
            <button
              type="submit"
              className="self-start rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-amber-400"
            >
              Send feedback
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
