// Shared chrome for the public site (landing, city pages, legal). The nav is
// a translucent floating layer per the house motion/material rules; content
// scrolls underneath it.
import Link from "next/link";

export function SiteNav() {
  return (
    <nav className="sticky top-0 z-40 border-b border-white/5 bg-zinc-950/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="text-lg font-black tracking-tight text-zinc-50">
          TRIVIUM
        </Link>
        <div className="flex items-center gap-5 text-sm">
          <Link href="/#how" className="hidden text-zinc-400 hover:text-zinc-100 sm:block">
            How it works
          </Link>
          <Link href="/#pricing" className="hidden text-zinc-400 hover:text-zinc-100 sm:block">
            Pricing
          </Link>
          <Link
            href="/login"
            className="rounded-lg bg-amber-400 px-4 py-2 font-bold text-zinc-950 transition-transform hover:bg-amber-300 active:scale-[0.97]"
          >
            Run trivia at your bar
          </Link>
        </div>
      </div>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-lg font-black tracking-tight text-zinc-50">TRIVIUM</p>
          <p className="mt-1 max-w-xs text-sm text-zinc-500">
            Bar trivia that runs itself. Built in Detroit, played anywhere with a TV.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm text-zinc-400 sm:grid-cols-3">
          <Link href="/login" className="hover:text-zinc-100">
            For venues
          </Link>
          <Link href="/detroit" className="hover:text-zinc-100">
            Trivia in Detroit
          </Link>
          <Link href="/#faq" className="hover:text-zinc-100">
            FAQ
          </Link>
          <Link href="/terms" className="hover:text-zinc-100">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-zinc-100">
            Privacy
          </Link>
          <a href="mailto:syzygy@agentmail.to" className="hover:text-zinc-100">
            Contact
          </a>
        </div>
      </div>
      <p className="pb-8 text-center text-xs text-zinc-500">
        © {new Date().getFullYear()} TRIVIUM · Syzygy Services
      </p>
    </footer>
  );
}
