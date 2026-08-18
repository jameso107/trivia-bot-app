"use client";

// First-run wizard (PRD §7): venue name/metro/slug in one screen. The RPC it
// submits to fires the org daemon's wake-up event — this form IS the top of
// the venue funnel, so it stays one step, no fluff.
import { useState } from "react";
import { signupVenue } from "./actions";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 32)
    .replace(/^-+|-+$/g, "");
}

export function FirstRunWizard({ error }: { error: string | null }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const effectiveSlug = slugTouched ? slug : slugify(name);

  return (
    <section
      className="mx-auto flex w-full max-w-lg flex-col gap-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-8"
      data-testid="first-run-wizard"
    >
      <div>
        <h2 className="text-2xl font-bold text-zinc-50">Set up your venue</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Ten minutes from here to your first live game — most of it picking a pack.
        </p>
      </div>

      <form action={signupVenue} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Venue name
          <input
            name="name"
            required
            maxLength={64}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="The Corner Taproom"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-base text-zinc-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Metro area
          <input
            name="metro"
            required
            maxLength={40}
            placeholder="Detroit"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-base text-zinc-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Your link name (goes on flyers — can&apos;t change later)
          <div className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5">
            <span className="text-zinc-500">/v/</span>
            <input
              name="slug"
              required
              maxLength={32}
              pattern="[a-z0-9][a-z0-9-]{1,30}[a-z0-9]"
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
              className="w-full bg-transparent text-base text-zinc-50 outline-none"
            />
          </div>
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="rounded-xl bg-amber-400 px-4 py-3 text-lg font-bold text-zinc-950 hover:bg-amber-300"
        >
          Create my venue
        </button>
      </form>
    </section>
  );
}
