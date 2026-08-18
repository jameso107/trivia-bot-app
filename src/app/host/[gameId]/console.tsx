"use client";

// M1 console: correct over beautiful (M3 owns the choreography). Renders
// exclusively from StatePayload broadcasts + resyncs; drives the machine via
// advance-game; auto-locks the question at the server deadline.
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { advanceGame, FnError, getGameState } from "@/lib/game/api";
import { useGameChannel } from "@/lib/game/use-game-channel";
import type {
  LobbyEvent,
  StatePayload,
  TickEvent,
} from "../../../../supabase/functions/_shared/protocol.ts";

const ADVANCE_LABEL: Record<string, string> = {
  lobby: "Start the night",
  round_intro: "First question",
  question: "Lock answers",
  final_question: "Lock answers",
  locked: "Reveal",
  reveal: "Next",
  scores: "Continue",
  intermission: "Next round",
  podium: "Wrap up",
};

export function Console({
  gameId,
  joinUrl,
  qrSvg,
}: {
  gameId: string;
  joinUrl: string;
  qrSvg: string;
}) {
  const [state, setState] = useState<StatePayload | null>(null);
  const [tick, setTick] = useState<TickEvent | null>(null);
  const [lastJoined, setLastJoined] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const advancing = useRef(false);

  const onState = useCallback((s: StatePayload) => {
    setState(s);
    setTick(null);
    setError(null);
  }, []);
  const onLobby = useCallback((e: LobbyEvent) => {
    setLastJoined(e.lastJoined);
    setState((prev) =>
      prev ? { ...prev, playerCount: e.playerCount, teams: e.teams } : prev,
    );
  }, []);
  const onTick = useCallback((e: TickEvent) => setTick(e), []);

  useGameChannel(gameId, { onState, onLobby, onTick });

  const advance = useCallback(async () => {
    if (!state || advancing.current) return;
    if (state.state === "ended" || state.state === "abandoned") return;
    advancing.current = true;
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await advanceGame({ gameId, expectedState: state.state, accessToken: token });
      setState(res.state);
      setError(null);
    } catch (err) {
      // 409 = someone else advanced (normal); anything else the host must SEE
      // — a silent failure reads as a frozen game.
      if (!(err instanceof FnError && err.status === 409)) {
        setError(err instanceof Error ? err.message : "advance failed");
      }
      const fresh = await getGameState({ gameId }).catch(() => null);
      if (fresh) setState(fresh);
    } finally {
      advancing.current = false;
    }
  }, [gameId, state]);

  // Keyboard driving: space advances (PRD §6 manual override).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        void advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance]);

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-3xl text-zinc-400">
        Warming up the console…
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-zinc-950 px-16 py-12 text-zinc-50">
      <header className="flex items-center justify-between text-2xl text-zinc-500">
        <span className="font-semibold uppercase tracking-widest text-amber-400">
          {state.packTitle || "Trivia Bot"}
        </span>
        <span data-testid="console-state" data-state={state.state}>
          {state.state !== "lobby" && state.round >= 1 && state.round <= state.rounds
            ? `Round ${state.round}`
            : ""}
          {state.question?.isFinal ? "Final question" : ""}
        </span>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-10 text-center">
        {state.state === "lobby" && (
          <div className="flex flex-col items-center gap-8">
            <h1 className="text-6xl font-black">Grab your phones — trivia is starting</h1>
            <div className="flex items-center gap-16">
              <div
                className="h-[400px] w-[400px] overflow-hidden rounded-2xl"
                aria-label={`QR code to join at ${joinUrl}`}
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <div className="flex flex-col items-start gap-4 text-left">
                <p className="text-3xl text-zinc-400">Scan, or go to this page and enter:</p>
                <p className="font-mono text-[120px] font-black leading-none tracking-widest text-amber-400" data-testid="join-code">
                  {state.joinCode}
                </p>
                <p className="text-4xl text-zinc-300" data-testid="player-count">
                  {state.playerCount} player{state.playerCount === 1 ? "" : "s"} in
                  {lastJoined ? ` — welcome, ${lastJoined}!` : ""}
                </p>
              </div>
            </div>
          </div>
        )}

        {state.state === "round_intro" && (
          <h1 className="text-7xl font-black">Round {state.round}</h1>
        )}

        {(state.state === "question" ||
          state.state === "final_question" ||
          state.state === "locked") &&
          state.question && (
            <div className="flex w-full max-w-6xl flex-col items-center gap-10">
              {state.question.isFinal && (
                <p className="text-3xl font-bold uppercase tracking-widest text-amber-400">
                  Final question — wager 0–100 on your phone
                </p>
              )}
              <h1 className="text-[64px] font-bold leading-tight" data-testid="question-prompt">
                {state.question.prompt}
              </h1>
              {state.question.options && (
                <ol className="grid w-full grid-cols-2 gap-6 text-left text-[48px]">
                  {state.question.options.map((opt, i) => (
                    <li key={i} className="rounded-2xl border border-zinc-700 bg-zinc-900 px-8 py-5">
                      <span className="mr-4 font-black text-amber-400">
                        {String.fromCharCode(65 + i)}
                      </span>
                      {opt}
                    </li>
                  ))}
                </ol>
              )}
              <div className="flex items-center gap-12 text-4xl text-zinc-400">
                {state.state === "locked" ? (
                  <span className="font-bold text-red-400">Answers locked</span>
                ) : state.deadlineTs ? (
                  <QuestionClock
                    key={state.deadlineTs}
                    deadlineTs={state.deadlineTs}
                    serverNowTs={state.serverNowTs}
                    onExpire={advance}
                  />
                ) : null}
                <span data-testid="answered-tick">
                  {(tick?.questionId === state.question.id ? tick.answeredTeams : 0)}/
                  {state.teams.length} teams in
                </span>
              </div>
            </div>
          )}

        {state.state === "reveal" && state.question && state.reveal && (
          <div className="flex w-full max-w-6xl flex-col items-center gap-8">
            <p className="text-4xl text-zinc-400">{state.question.prompt}</p>
            <h1 className="text-7xl font-black text-emerald-400" data-testid="reveal-answer">
              {formatAnswer(state)}
            </h1>
            {state.reveal.answerNote && (
              <p className="text-3xl text-zinc-500">{state.reveal.answerNote}</p>
            )}
            <ul className="w-full max-w-3xl text-4xl" data-testid="reveal-teams">
              {state.reveal.teamResults.map((t) => (
                <li key={t.teamId} className="flex justify-between border-b border-zinc-800 py-2">
                  <span>{t.name}</span>
                  <span
                    className={
                      !t.answered
                        ? "text-zinc-600"
                        : t.isCorrect
                          ? "text-emerald-400"
                          : "text-red-400"
                    }
                  >
                    {t.answered ? `${t.points >= 0 ? "+" : ""}${t.points}` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(state.state === "scores" ||
          state.state === "intermission" ||
          state.state === "podium") && (
          <div className="flex w-full max-w-4xl flex-col items-center gap-8">
            <h1 className="text-6xl font-black">
              {state.state === "podium" ? "Final standings" : `Scores — round ${state.round}`}
            </h1>
            <ol className="w-full text-[36px]" data-testid="leaderboard">
              {state.leaderboard.map((t) => (
                <li
                  key={t.teamId}
                  data-team={t.name}
                  data-score={t.score}
                  className="flex justify-between border-b border-zinc-800 py-3"
                >
                  <span>
                    <span className="mr-6 font-black text-amber-400">{t.rank}</span>
                    {t.name}
                  </span>
                  <span className="font-bold">{t.score}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {state.state === "ended" && (
          <h1 className="text-6xl font-black" data-testid="ended-screen">
            That&apos;s the night — thanks for playing!
          </h1>
        )}
      </section>

      {error && (
        <p
          role="alert"
          data-testid="console-error"
          className="mx-auto rounded-lg border border-red-900 bg-red-950 px-4 py-2 text-xl text-red-300"
        >
          {error} — resynced; try again or check the wifi.
        </p>
      )}

      <footer className="flex items-center justify-between text-zinc-600">
        <span className="text-xl">
          Join: {joinUrl} · code {state.joinCode}
        </span>
        {state.state !== "ended" && state.state !== "abandoned" && (
          <button
            type="button"
            data-testid="advance-button"
            onClick={() => void advance()}
            className="rounded-xl border border-zinc-700 px-6 py-3 text-2xl text-zinc-300 hover:border-amber-400"
          >
            {ADVANCE_LABEL[state.state] ?? "Advance"} <kbd className="ml-2 text-zinc-500">space</kbd>
          </button>
        )}
      </footer>
    </main>
  );
}

// Countdown against the server's clock (skew computed from the broadcast's
// serverNowTs). Expiry fires the server-validated lock — the deadline the
// server enforces is authoritative regardless of what this displays (PRD §5).
function QuestionClock({
  deadlineTs,
  serverNowTs,
  onExpire,
}: {
  deadlineTs: string;
  serverNowTs: string;
  onExpire: () => Promise<void> | void;
}) {
  const [skewMs] = useState(() => Date.parse(serverNowTs) - Date.now());
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  const remaining = useCallback(() => {
    const deadline = Date.parse(deadlineTs);
    return Math.max(0, Math.ceil((deadline - (Date.now() + skewMs)) / 1000));
  }, [deadlineTs, skewMs]);

  const [secondsLeft, setSecondsLeft] = useState(() => remaining());
  const expired = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      const left = remaining();
      setSecondsLeft(left);
      if (left <= 0 && !expired.current) {
        expired.current = true;
        void onExpireRef.current();
      }
    }, 250);
    return () => clearInterval(id);
  }, [remaining]);

  return <span data-testid="console-clock">{secondsLeft}s</span>;
}

function formatAnswer(state: StatePayload): string {
  const q = state.question!;
  const answer = state.reveal!.answer;
  if (q.format === "multiple_choice" && typeof answer === "number" && q.options) {
    return `${String.fromCharCode(65 + answer)}. ${q.options[answer]}`;
  }
  if (q.format === "true_false") return answer ? "True" : "False";
  if (q.format === "open_text" && answer && typeof answer === "object") {
    const accept = (answer as { accept?: string[] }).accept;
    return accept?.[0] ?? "";
  }
  return String(answer);
}
