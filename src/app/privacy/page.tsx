// Privacy policy — adapted from the org contracts agent's draft (2026-08-21),
// rebranded per D-011. Counsel review remains on the owner checklist.
import { SiteFooter, SiteNav } from "../site-chrome";

export const metadata = { title: "Privacy — TRIVIUM" };

const SECTIONS: Array<{ h: string; body: string[] }> = [
  {
    h: "Who we are",
    body: [
      "TRIVIUM is operated by Syzygy Services (\"we\", \"us\"). This policy covers the TRIVIUM website and game platform used by venues, venue staff, and players. Contact: james@syzygy.services.",
    ],
  },
  {
    h: "What we collect",
    body: [
      "Players: a display name you type at the table, your answers and scores, and — only if you choose to save your night — an email address. Playing never requires an account.",
      "Venues: contact details, venue name and address, and account email.",
      "Everyone: basic usage analytics (game events, timings, aggregate counts) and the technical minimum for sessions to work (a device key stored on your phone for rejoining a game).",
      "We do not knowingly collect personal data from children under 13.",
    ],
  },
  {
    h: "What we use it for",
    body: [
      "Running the game: scores, leaderboards, rejoins, and dispute rulings.",
      "Player accounts: keeping your streaks and stats across nights, only after you explicitly save them.",
      "Improving the product: aggregate analytics about how nights run. We look at counts and timings, not at who you are.",
      "Talking to venues: onboarding, support, and service messages.",
    ],
  },
  {
    h: "What we never do",
    body: [
      "We don't sell personal data. We don't share player identities with sponsors — sponsors see aggregate delivery numbers only. We don't spam players: saving your stats opts you into your own history, not a mailing list.",
    ],
  },
  {
    h: "Where it lives",
    body: [
      "Data is stored with our infrastructure providers (Supabase/PostgreSQL, hosted in the United States) and protected by row-level access controls. Emails are delivered through our email providers.",
    ],
  },
  {
    h: "Your choices",
    body: [
      "Ask us to export or delete your data any time at james@syzygy.services and we'll do it within 30 days. Deleting your account removes your saved history; anonymous game rows (a team name on a night's leaderboard) may persist.",
    ],
  },
  {
    h: "Changes",
    body: [
      "We'll post changes here with a new effective date. Material changes to what we collect get called out on the site, not buried.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <h1 className="text-4xl font-black tracking-[-0.02em] text-zinc-50">Privacy</h1>
        <p className="mt-2 text-sm text-zinc-400">Effective 2026-08-21</p>
        {SECTIONS.map((s) => (
          <section key={s.h} className="mt-10">
            <h2 className="text-xl font-bold text-zinc-100">{s.h}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="mt-3 leading-7 text-zinc-400">
                {p}
              </p>
            ))}
          </section>
        ))}
      </main>
      <SiteFooter />
    </>
  );
}
