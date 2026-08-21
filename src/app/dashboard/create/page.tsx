import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PackBuilder } from "./builder";

export const metadata = { title: "Create a pack — TRIVIUM" };

export default async function CreatePackPage({ searchParams }: PageProps<"/dashboard/create">) {
  const params = await searchParams;
  const packId = typeof params.pack === "string" ? params.pack : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase
    .from("venue_members")
    .select("venue_id")
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-400">TRIVIUM</p>
          <h1 className="text-3xl font-bold text-zinc-50">Your own trivia</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Write it your way — inside jokes, regulars&apos; names, last week&apos;s drama. Five
            questions minimum; it&apos;s only ever visible to your venue.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500"
        >
          ← Dashboard
        </Link>
      </header>
      <PackBuilder packId={packId} />
    </main>
  );
}
