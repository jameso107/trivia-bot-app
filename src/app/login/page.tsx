import Link from "next/link";
import { displayFont } from "../fonts";
import { sendMagicLink } from "./actions";
import { ActionButton } from "../action-button";

export const metadata = { title: "Sign in — TRIVIUM" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const sent = params.sent === "1";
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main className={`site-atmosphere flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16 ${displayFont.variable}`}>
      <Link href="/" className="text-sm font-semibold uppercase tracking-widest text-amber-400">
        TRIVIUM
      </Link>

      <div className="enter-up w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
        {sent ? (
          <div className="flex flex-col gap-3 text-center" data-testid="magic-link-sent">
            <h1 className="font-display text-2xl font-bold text-zinc-50">Check your email</h1>
            <p className="text-zinc-400">
              We sent you a sign-in link. Click it on this device and you&apos;re in.
            </p>
            <Link href="/login" className="text-sm text-amber-400 hover:underline">
              Use a different email
            </Link>
          </div>
        ) : (
          <form action={sendMagicLink} className="flex flex-col gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-zinc-50">Run trivia at your bar</h1>
              <p className="mt-1 text-sm text-zinc-400">
                No password. We email you a sign-in link.
              </p>
            </div>
            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              Email
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@yourbar.com"
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-base text-zinc-50 outline-none focus:border-amber-400"
              />
            </label>
            {error ? (
              <p className="text-sm text-red-400" role="alert">
                {error}
              </p>
            ) : null}
            <ActionButton
              pendingText="Sending your link…"
              className="hover-lift rounded-lg bg-amber-400 px-4 py-2.5 font-semibold text-zinc-950 hover:bg-amber-300"
            >
              Email me a sign-in link
            </ActionButton>
          </form>
        )}
      </div>
    </main>
  );
}
