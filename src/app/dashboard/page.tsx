import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard — Trivia Bot" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-400">
            Trivia Bot
          </p>
          <h1 className="text-3xl font-bold text-zinc-50">Venue dashboard</h1>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
        <p className="text-zinc-300" data-testid="signed-in-as">
          Signed in as <span className="font-semibold text-zinc-50">{user.email}</span>
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Venue setup, night creation, and history land here in M5. This page
          exists in M0 to prove the magic-link auth loop end to end.
        </p>
      </section>
    </main>
  );
}
