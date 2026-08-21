// Venue terms — adapted from the org contracts agent's draft (2026-08-21),
// rebranded per D-011. Counsel review remains on the owner checklist.
import { SiteFooter, SiteNav } from "../site-chrome";

export const metadata = { title: "Terms — TRIVIUM" };

const SECTIONS: Array<{ h: string; body: string[] }> = [
  {
    h: "The deal",
    body: [
      "TRIVIUM (operated by Syzygy Services, \"Provider\") supplies trivia content and the TRIVIUM hosting platform to participating venues (\"Venue\"). The core service is free; optional premium services are described where offered.",
    ],
  },
  {
    h: "License",
    body: [
      "Venues get a non-exclusive, non-transferable license to use TRIVIUM materials for in-person events at their venue. Display it for your patrons all you like; no redistribution, resale, or sublicensing without our consent.",
      "Packs a venue writes with the pack builder belong to the venue. We host them, keep them private to that venue, and only process them to run the venue's games.",
    ],
  },
  {
    h: "Venue responsibilities",
    body: [
      "Run a safe event and comply with local laws — including any rules about promotions and prizes; TRIVIUM ships with no cash-prize mechanics, and venues that offer prizes do so on their own terms and responsibility.",
      "Venue-authored questions must not be unlawful, hateful, or infringe someone else's rights. We can remove content that breaks this.",
      "Report content errors — the dispute button exists for a reason; upheld disputes are tracked in our public error rate.",
    ],
  },
  {
    h: "Service and availability",
    body: [
      "We aim for boring reliability and design nights to survive a dropped browser, but the service is provided \"as is\" without warranties. Our total liability for any claim is capped at the greater of $100 or fees the venue paid us in the prior 12 months.",
    ],
  },
  {
    h: "Ending things",
    body: [
      "Either side can walk away any time. On termination the venue stops using the materials; night history and the venue's own packs can be exported on request before deletion.",
    ],
  },
  {
    h: "Changes and contact",
    body: [
      "We may update these terms with notice on this page. Questions, disputes, exports: james@syzygy.services.",
    ],
  },
];

export default function TermsPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <h1 className="text-4xl font-black tracking-[-0.02em] text-zinc-50">Venue terms</h1>
        <p className="mt-2 text-sm text-zinc-500">Effective 2026-08-21</p>
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
