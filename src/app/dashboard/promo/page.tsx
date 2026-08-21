import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "./print-button";

export const metadata = { title: "Promo kit — TRIVIUM" };

// The promo kit (PRD §7): a printable flyer + copy-paste social captions.
// Plain HTML with a print stylesheet — no PDF service by decision. The QR
// targets /v/{slug}, which always forwards to the venue's current game.
export default async function PromoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("venue_members")
    .select("venues(name, metro, slug)")
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/dashboard");
  const venue = membership.venues as unknown as {
    name: string;
    metro: string | null;
    slug: string;
  };

  const h = await headers();
  const envOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  const headerOrigin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  const origin = envOrigin && envOrigin.startsWith("http") ? envOrigin : headerOrigin;
  const joinUrl = `${origin}/v/${venue.slug}`;

  const qrSvg = await QRCode.toString(joinUrl, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: { dark: "#18181b", light: "#ffffff" },
  });

  const captions = [
    `Trivia night at ${venue.name}. No app, no signup — scan the QR on the screen and you're playing. Bring your smartest friends (or your funniest).`,
    `The robot host doesn't do warm-ups. 4 rounds, 1 final wager, bragging rights at ${venue.name}. Phones out.`,
    `Free trivia at ${venue.name} — join in 10 seconds from your phone. Winner gets the podium. Loser buys the nachos. House rules.`,
  ];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12 print:max-w-none print:p-0">
      <header className="flex items-center justify-between print:hidden">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-400">
            Promo kit
          </p>
          <h1 className="text-3xl font-bold text-zinc-50">{venue.name}</h1>
        </div>
        <PrintButton />
      </header>

      {/* The flyer — this part prints */}
      <section
        data-testid="flyer"
        className="flex flex-col items-center gap-6 rounded-2xl border border-zinc-700 bg-white px-10 py-14 text-center text-zinc-900 print:min-h-screen print:justify-center print:rounded-none print:border-0"
      >
        <p className="text-xl font-bold uppercase tracking-[0.3em] text-zinc-400">
          Trivia night
        </p>
        <h2 className="text-5xl font-black leading-tight">{venue.name}</h2>
        <p className="text-xl text-zinc-400">
          Free to play · no app · join from your phone in 10 seconds
        </p>
        <div
          className="h-[320px] w-[320px]"
          aria-label={`QR code linking to ${joinUrl}`}
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <p className="font-mono text-2xl font-bold">{joinUrl}</p>
        <p className="text-lg text-zinc-400">
          Scan when the game is live — teams welcome, winners insufferable.
        </p>
      </section>

      <section className="flex flex-col gap-3 print:hidden">
        <h2 className="text-xl font-semibold text-zinc-200">Social captions</h2>
        <ul className="flex flex-col gap-3" data-testid="captions">
          {captions.map((c, i) => (
            <li
              key={i}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-zinc-300"
            >
              {c}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
