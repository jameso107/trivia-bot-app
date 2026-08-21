// The public site (trivium.games). One primary CTA — "Run trivia at your
// bar" — everything else supports it. Typography: display sizes carry tight
// leading and negative tracking; body stays airy. Motion is press-states and
// one gentle hero float, disabled under prefers-reduced-motion (globals).
import Link from "next/link";
import { SiteFooter, SiteNav } from "./site-chrome";
import { submitInquiry } from "./site-actions";

export const metadata = {
  title: "TRIVIUM — bar trivia that runs itself",
  description:
    "A full trivia night from any computer plugged into a TV. Players join by QR in seconds, the night hosts itself, and the bar keeps the fun without the $200 host. Free for venues.",
};

const STEPS = [
  {
    n: "1",
    title: "Plug in, pick a pack",
    body: "Any computer, any TV, a browser. Choose from the QA'd library — or write your own pack about your bar, your regulars, your block.",
  },
  {
    n: "2",
    title: "The room scans one QR",
    body: "Phones join in seconds. No app, no accounts, no friction — teams form at the table and the big screen fills with names.",
  },
  {
    n: "3",
    title: "The night runs itself",
    body: "Questions, countdowns, reveals with sources, standings, a final wager. Your staff pours drinks; the console does the hosting.",
  },
];

const FEATURES = [
  {
    title: "Auto-host with taste",
    body: "Paced reveals, score drama, a host voice if you want one. Space bar takes the wheel any time.",
    big: true,
  },
  {
    title: "Write your own packs",
    body: "A five-minute editor for house questions. Only your venue ever sees them.",
    big: false,
  },
  {
    title: "Fair, sourced answers",
    body: "Every answer carries its source. Players can dispute; rulings are researched, not vibes.",
    big: false,
  },
  {
    title: "Players keep their glory",
    body: "One tap after the game saves a player's night — streaks and stats follow them to any TRIVIUM bar.",
    big: false,
  },
  {
    title: "Built for rush hour",
    body: "Load-tested to 150 phones on bar wifi. If the TV browser crashes, the game state survives — reopen and go.",
    big: true,
  },
];

const FAQ = [
  {
    q: "What does it cost?",
    a: "Nothing. The core night is free for venues — packs, hosting, player joins, all of it. Premium adds bespoke packs written for your venue on request.",
  },
  {
    q: "What equipment do we need?",
    a: "A computer plugged into a TV (or any big screen) with a web browser, and wifi your patrons can reach. That's the whole list.",
  },
  {
    q: "Do we need someone to host?",
    a: "No — auto-host runs the pacing, reveals, and scores. A bartender can take manual control with the space bar whenever they want the mic moment.",
  },
  {
    q: "How do players join?",
    a: "They scan the QR on the screen and they're in — browser only, no app download, no sign-up required to play.",
  },
  {
    q: "Can we use our own questions?",
    a: "Yes. The pack builder lets you write multiple-choice and true/false questions in minutes, publish them to your private library, and run whole nights on them.",
  },
  {
    q: "What about wrong answers in packs?",
    a: "Every library question ships with a source, and players can file disputes from their phones. Upheld disputes are tracked publicly in our error rate — we keep ourselves honest.",
  },
];

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const inquiry = typeof params.inquiry === "string" ? params.inquiry : null;
  const inquiryWhy = typeof params.why === "string" ? params.why : null;

  return (
    <>
      <SiteNav />
      <main className="flex flex-1 flex-col">
        {/* ---- hero: outcome headline + the product itself ---- */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 pb-20 pt-16 lg:grid-cols-2 lg:pt-24">
          <div className="flex flex-col items-start gap-5">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">
              Free for venues · no host needed · ten-minute setup
            </p>
            <h1 className="text-[clamp(2.75rem,6vw,4.5rem)] font-black leading-[1.02] tracking-[-0.02em] text-zinc-50">
              Trivia night
              <br />
              runs itself.
            </h1>
            <p className="max-w-md text-lg leading-8 text-zinc-400">
              TRIVIUM turns any TV into a self-hosting trivia night. Players join by QR in
              seconds — the bar keeps the packed Tuesday and skips the $200 host.
            </p>
            <div className="flex flex-col items-start gap-3">
              <Link
                href="/login"
                className="rounded-xl bg-amber-400 px-7 py-3.5 text-lg font-bold text-zinc-950 transition-transform hover:bg-amber-300 active:scale-[0.97]"
              >
                Run trivia at your bar
              </Link>
              <span className="text-sm text-zinc-400">
                Ten minutes from signup to your first live game.
              </span>
            </div>
          </div>

          {/* the product, not an illustration: TV + phone built from the real UI */}
          <div className="relative mx-auto w-full max-w-lg" aria-hidden="true">
            <div className="hero-float rounded-2xl border border-zinc-700 bg-zinc-900 p-3 shadow-2xl shadow-black/50">
              <div className="rounded-lg bg-zinc-950 p-6">
                <div className="flex items-center justify-between text-xs uppercase tracking-wider text-zinc-400">
                  <span>Round 2 · Question 4</span>
                  <span className="text-amber-400">00:12</span>
                </div>
                <p className="mt-4 text-2xl font-bold leading-snug text-zinc-50">
                  Which Detroit street is named after a French word for “strait”?
                </p>
                <ol className="mt-5 grid grid-cols-2 gap-2 text-sm text-zinc-300">
                  {["Gratiot", "Livernois", "Détroit… wait", "Woodward"].map((o, i) => (
                    <li
                      key={o}
                      className={`rounded-lg border px-3 py-2 ${
                        i === 2 ? "border-amber-500/60 bg-amber-400/10" : "border-zinc-800"
                      }`}
                    >
                      {String.fromCharCode(65 + i)}. {o}
                    </li>
                  ))}
                </ol>
                <div className="mt-5 flex items-center justify-between text-xs text-zinc-400">
                  <span>7 of 9 teams answered</span>
                  <span>Join: trivium.games · code TAPS</span>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-8 -right-2 w-36 rotate-3 rounded-2xl border border-zinc-700 bg-zinc-900 p-2 shadow-xl shadow-black/60 sm:-right-6">
              <div className="rounded-xl bg-zinc-950 p-3">
                <p className="text-[10px] uppercase tracking-wider text-zinc-400">Team Sharkbait</p>
                <p className="mt-1 text-xs font-semibold text-zinc-200">Your answer is in 🔒</p>
                <div className="mt-2 h-1.5 w-full rounded bg-zinc-800">
                  <div className="h-1.5 w-2/3 rounded bg-amber-400" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---- how it works ---- */}
        <section id="how" className="border-t border-zinc-900 bg-zinc-900/40">
          <div className="mx-auto w-full max-w-6xl px-6 py-20">
            <h2 className="text-3xl font-black tracking-[-0.01em] text-zinc-50">
              Three steps. Zero staff.
            </h2>
            <div className="mt-10 grid gap-8 md:grid-cols-3">
              {STEPS.map((s) => (
                <div key={s.n} className="flex flex-col gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-400 text-lg font-black text-zinc-950">
                    {s.n}
                  </span>
                  <h3 className="text-xl font-bold text-zinc-100">{s.title}</h3>
                  <p className="leading-7 text-zinc-400">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- features bento ---- */}
        <section className="mx-auto w-full max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-black tracking-[-0.01em] text-zinc-50">
            Everything a great night needs.
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-6 ${
                  f.big ? "lg:col-span-2" : ""
                }`}
              >
                <h3 className="text-lg font-bold text-zinc-100">{f.title}</h3>
                <p className="mt-2 leading-7 text-zinc-400">{f.body}</p>
              </div>
            ))}
            <div className="rounded-2xl border border-amber-500/40 bg-amber-400/5 p-6">
              <h3 className="text-lg font-bold text-amber-300">Made in Detroit</h3>
              <p className="mt-2 leading-7 text-zinc-400">
                Piloting across Metro Detroit bars now — early venues shape the roadmap.
              </p>
            </div>
          </div>
        </section>

        {/* ---- pricing ---- */}
        <section id="pricing" className="border-t border-zinc-900">
          <div className="mx-auto w-full max-w-6xl px-6 py-20">
            <h2 className="text-3xl font-black tracking-[-0.01em] text-zinc-50">
              Free. Actually free.
            </h2>
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-8">
                <p className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                  Every night
                </p>
                <p className="mt-2 text-4xl font-black text-zinc-50">$0</p>
                <ul className="mt-5 flex flex-col gap-2 text-zinc-300">
                  <li>· The full QA&apos;d pack library</li>
                  <li>· Auto-host, QR joins, live scoring</li>
                  <li>· Your own pack builder</li>
                  <li>· Player accounts &amp; streaks</li>
                  <li>· Promo kit for your door and socials</li>
                </ul>
                <Link
                  href="/login"
                  className="mt-6 inline-block rounded-xl bg-amber-400 px-6 py-3 font-bold text-zinc-950 transition-transform hover:bg-amber-300 active:scale-[0.97]"
                >
                  Start tonight
                </Link>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8">
                <p className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                  Premium (soon)
                </p>
                <p className="mt-2 text-4xl font-black text-zinc-300">Bespoke</p>
                <p className="mt-5 leading-7 text-zinc-400">
                  Custom packs researched and written for your venue on request — your theme
                  nights, your anniversary specials, your crowd. Early pilot venues get them
                  comped.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---- FAQ ---- */}
        <section id="faq" className="border-t border-zinc-900">
          <div className="mx-auto w-full max-w-3xl px-6 py-20">
            <h2 className="text-3xl font-black tracking-[-0.01em] text-zinc-50">
              Questions bars actually ask
            </h2>
            <div className="mt-8 flex flex-col divide-y divide-zinc-900">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-lg font-semibold text-zinc-100 [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span className="ml-4 text-zinc-400 transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 leading-7 text-zinc-400">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---- inbound: talk to us ---- */}
        <section id="talk" className="border-t border-zinc-900 bg-zinc-900/40">
          <div className="mx-auto w-full max-w-3xl px-6 py-20 text-center">
            <h2 className="text-3xl font-black tracking-[-0.01em] text-zinc-50">
              Not ready to click a button? Fair.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-zinc-400">
              Leave an email and we&apos;ll reach out with a one-pager, a demo night offer, and
              zero follow-up spam.
            </p>
            {inquiry === "sent" ? (
              <p
                data-testid="inquiry-sent"
                className="mx-auto mt-6 max-w-md rounded-xl border border-emerald-900 bg-emerald-950 px-5 py-4 text-emerald-300"
              >
                Got it — a real note is on its way. Talk soon.
              </p>
            ) : (
              <form
                action={submitInquiry}
                className="mx-auto mt-6 flex max-w-md flex-col gap-3 sm:flex-row"
                data-testid="inquiry-form"
              >
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="you@yourbar.com"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-zinc-50"
                />
                <button
                  type="submit"
                  className="rounded-xl border border-amber-500 px-6 py-3 font-bold text-amber-300 transition-transform hover:bg-amber-950 active:scale-[0.97]"
                >
                  Talk trivia
                </button>
              </form>
            )}
            {inquiry === "error" && inquiryWhy && (
              <p role="alert" className="mt-3 text-sm text-red-400">
                {inquiryWhy}
              </p>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "TRIVIUM",
            applicationCategory: "EntertainmentApplication",
            operatingSystem: "Web",
            description:
              "Self-hosting bar trivia: players join by QR, the night runs itself on any TV.",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          }),
        }}
      />
    </>
  );
}
