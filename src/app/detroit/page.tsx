// City SEO page — seeded from the org's website-content agent draft
// (outbox 2026-08-21), edited to the brand voice. More cities follow the
// same shape as pilots land.
import Link from "next/link";
import { SiteFooter, SiteNav } from "../site-chrome";

export const metadata = {
  title: "Trivia night in Detroit — TRIVIUM",
  description:
    "Weekly bar trivia across Metro Detroit: QR join from your phone, self-hosting nights, free for venues. Find a night or bring TRIVIUM to your bar.",
};

export default function DetroitPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">
          Metro Detroit
        </p>
        <h1 className="mt-3 text-[clamp(2.25rem,5vw,3.5rem)] font-black leading-[1.05] tracking-[-0.02em] text-zinc-50">
          Trivia night in Detroit
        </h1>
        <p className="mt-5 text-lg leading-8 text-zinc-400">
          Love trivia? Detroit-area bars run TRIVIUM nights — join a team, grab a pitcher, and
          prove your useless knowledge is actually useful. We&apos;re piloting across Metro
          Detroit now and adding venues every week.
        </p>

        <h2 className="mt-12 text-2xl font-bold text-zinc-100">What a night looks like</h2>
        <ul className="mt-4 flex flex-col gap-3 leading-7 text-zinc-400">
          <li>· Quick rounds of ten with a live on-screen host and a final wager.</li>
          <li>· Join by scanning the QR on the big screen — no app, no signup.</li>
          <li>· Answers carry sources; you can dispute a bad call from your phone.</li>
          <li>· Save your result after the game and your streak follows you to any TRIVIUM bar.</li>
        </ul>

        <h2 className="mt-12 text-2xl font-bold text-zinc-100">Run it at your Detroit bar</h2>
        <p className="mt-4 leading-8 text-zinc-400">
          TRIVIUM is free for venues: the whole night runs itself from any computer plugged into
          a TV. Ten minutes from signup to your first live game, a promo kit for the door, and a
          pack library written and fact-checked for bar play — plus a builder for your own house
          questions.
        </p>
        <div className="mt-6 flex items-center gap-4">
          <Link
            href="/login"
            className="rounded-xl bg-amber-400 px-6 py-3 font-bold text-zinc-950 transition-transform hover:bg-amber-300 active:scale-[0.97]"
          >
            Run trivia at your bar
          </Link>
          <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-100">
            How it works →
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
