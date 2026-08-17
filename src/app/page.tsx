import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-24 text-center">
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">
          Free · no host · ten-minute setup
        </p>
        <h1 className="max-w-3xl text-5xl font-black tracking-tight text-zinc-50 sm:text-7xl">
          Trivia Bot
        </h1>
        <p className="max-w-xl text-lg leading-8 text-zinc-400">
          A full trivia night from any computer plugged into a TV. Players join
          from their phones by QR in seconds. It runs itself — the bar keeps the
          fun and skips the $200 host.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Link
          href="/login"
          className="rounded-xl bg-amber-400 px-6 py-3 text-lg font-bold text-zinc-950 hover:bg-amber-300"
        >
          Run trivia at your bar
        </Link>
        <span className="text-sm text-zinc-500">
          Players: scan the QR on the big screen to join.
        </span>
      </div>
    </main>
  );
}
