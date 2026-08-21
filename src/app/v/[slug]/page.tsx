import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Join the game — TRIVIUM" };

// The flyer QR's permanent target: forwards to the venue's current game, or
// tells you when to come back. Public — no auth, no membership.
export default async function VenueJoinPage({ params }: PageProps<"/v/[slug]">) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("venue_current_game", { p_slug: slug });
  const info = data as { venue_name: string | null; join_code: string | null } | null;

  if (info?.join_code) redirect(`/j/${info.join_code}`);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-amber-400">
        TRIVIUM
      </p>
      <h1 className="text-3xl font-black" data-testid="no-game">
        {info?.venue_name ? `No live game at ${info.venue_name} right now` : "Venue not found"}
      </h1>
      <p className="text-zinc-400">
        {info?.venue_name
          ? "Scan again when the big screen says go — the game opens minutes before start."
          : "Double-check the link on the flyer."}
      </p>
    </main>
  );
}
