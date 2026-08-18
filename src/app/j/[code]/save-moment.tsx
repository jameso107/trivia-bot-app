"use client";

// The sacred moment (PRD §1/§7): the night just ended, the player is warm,
// and one email field turns them into an account. Never gates play — it's
// an offer, not a wall.
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { playerStats, type PlayerStats } from "@/lib/game/api";

interface Identity {
  gameId: string;
  playerId: string;
  teamId: string;
  deviceKey: string;
  displayName: string;
}

// Player-side feedback capture (PRD §7) — lands in user-support's queue.
function FeedbackNudge({ gameId }: { gameId: string }) {
  const [sent, setSent] = useState(false);
  async function send(formData: FormData) {
    const body = String(formData.get("body") ?? "").trim();
    if (body.length < 3) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("submit_feedback", {
      p_source: "player",
      p_body: body,
      p_game_id: gameId,
    });
    if (!error) setSent(true);
  }
  if (sent) {
    return (
      <p className="text-center text-sm text-emerald-400" data-testid="player-feedback-sent">
        Thanks — a human reads every one.
      </p>
    );
  }
  return (
    <details className="text-center text-sm text-zinc-400">
      <summary className="cursor-pointer hover:text-zinc-300">
        Something off tonight? Tell us
      </summary>
      <form action={send} className="mt-2 flex flex-col gap-2">
        <textarea
          name="body"
          required
          rows={2}
          maxLength={2000}
          data-testid="player-feedback-body"
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-50"
        />
        <button
          type="submit"
          className="self-center rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-amber-400"
        >
          Send
        </button>
      </form>
    </details>
  );
}

export function SaveMoment({ identity }: { identity: Identity }) {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [failed, setFailed] = useState(false);
  const [phase, setPhase] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    playerStats({
      gameId: identity.gameId,
      playerId: identity.playerId,
      deviceKey: identity.deviceKey,
    })
      .then(setStats)
      .catch(() => setFailed(true));
  }, [identity.gameId, identity.playerId, identity.deviceKey]);

  async function sendSaveLink(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim();
    if (!email.includes("@")) {
      setError("Enter a valid email");
      return;
    }
    setPhase("sending");
    setError(null);
    const next = `/save/complete?game=${identity.gameId}&player=${identity.playerId}&key=${identity.deviceKey}`;
    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`,
      },
    });
    if (otpError) {
      setError(otpError.message);
      setPhase("idle");
    } else {
      setPhase("sent");
    }
  }

  if (failed) {
    return (
      <p className="text-center text-zinc-400" data-testid="player-ended">
        Good night! Thanks for playing.
      </p>
    );
  }
  if (!stats) {
    return (
      <p className="text-center text-zinc-400" data-testid="player-ended">
        Tallying your night…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="player-ended">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-bold">That&apos;s the night!</h1>
        {stats.teamName && (
          <p className="text-lg text-zinc-300" data-testid="final-standing">
            {stats.teamName}: #{stats.rank} of {stats.teamsTotal} · {stats.score} pts
          </p>
        )}
      </div>

      <dl className="grid grid-cols-3 gap-3 text-center" data-testid="personal-stats">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
          <dt className="text-xs uppercase tracking-wider text-zinc-400">You answered</dt>
          <dd className="text-2xl font-black">{stats.answered}</dd>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
          <dt className="text-xs uppercase tracking-wider text-zinc-400">Got right</dt>
          <dd className="text-2xl font-black text-emerald-400">{stats.correct}</dd>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
          <dt className="text-xs uppercase tracking-wider text-zinc-400">Fastest</dt>
          <dd className="text-2xl font-black text-amber-400">
            {stats.fastestSeconds !== null ? `${stats.fastestSeconds}s` : "—"}
          </dd>
        </div>
      </dl>

      <FeedbackNudge gameId={identity.gameId} />

      {stats.alreadySaved ? (
        <p className="text-center text-emerald-400" data-testid="already-saved">
          Saved to your account ✓ — see your nights at{" "}
          <a href="/me" className="underline">
            /me
          </a>
        </p>
      ) : phase === "sent" ? (
        <div className="flex flex-col gap-1 text-center" data-testid="save-link-sent">
          <p className="text-lg font-semibold text-emerald-400">Check your email</p>
          <p className="text-sm text-zinc-400">
            Click the link and tonight&apos;s stats are yours forever.
          </p>
        </div>
      ) : (
        <form action={sendSaveLink} className="flex flex-col gap-3" data-testid="save-form">
          <p className="text-center text-zinc-300">
            Keep your stats. Build your streak. One email, no password.
          </p>
          <input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            autoComplete="email"
            data-testid="save-email"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-lg"
          />
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={phase === "sending"}
            className="rounded-xl bg-amber-400 px-4 py-3 text-lg font-bold text-zinc-950 disabled:opacity-50"
          >
            Save my stats
          </button>
        </form>
      )}
    </div>
  );
}
