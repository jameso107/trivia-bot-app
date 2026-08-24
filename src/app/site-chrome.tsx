// Shared chrome for the public site (landing, city pages, legal). The nav is
// a translucent floating layer per the house motion/material rules; content
// scrolls underneath it.
import Link from "next/link";
import { displayFont } from "./fonts";

export function SiteNav() {
  return (
    <nav className={`sticky top-0 z-50 border-b border-white/5 bg-zinc-950/70 backdrop-blur-xl ${displayFont.variable}`}>
      {/* Scroll reveals are progressive enhancement: without JS the content
          must simply be there — never a page of invisible sections. */}
      <noscript>
        <style>{`.reveal{opacity:1 !important;transform:none !important}.enter-up{animation:none !important;opacity:1 !important;filter:none !important}`}</style>
      </noscript>
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="font-display text-lg font-extrabold tracking-tight text-zinc-50 transition-transform duration-300 hover:scale-[1.04]">
          TRIVIUM
        </Link>
        <div className="flex items-center gap-5 text-sm">
          <Link href="/#how" className="nav-underline hidden text-zinc-400 hover:text-zinc-100 sm:block">
            How it works
          </Link>
          <Link href="/#pricing" className="nav-underline hidden text-zinc-400 hover:text-zinc-100 sm:block">
            Pricing
          </Link>
          <Link
            href="/login"
            className="hover-lift rounded-lg bg-amber-400 px-4 py-2 font-bold text-zinc-950 hover:bg-amber-300"
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
    <footer className={`border-t border-zinc-900 ${displayFont.variable}`}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-display text-lg font-extrabold tracking-tight text-zinc-50">TRIVIUM</p>
          <p className="mt-1 max-w-xs text-sm text-zinc-400">
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
      <p className="pb-8 text-center text-xs text-zinc-400">
        © {new Date().getFullYear()} TRIVIUM · Syzygy Services
      </p>
    </footer>
  );
}
