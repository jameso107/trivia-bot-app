"use client";

// The TV. M3: it runs itself — every state carries a dwell and advances on
// its own (the auto-host), each beat gets a personality line from host_lines,
// reveals play out in stages (dim → answer + source → score deltas), and a
// bartender can still take the wheel: space advances, p pauses the engine
// (PRD §6 manual override). Renders exclusively from StatePayload broadcasts;
// the server validates every transition regardless of who asked.
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { advanceGame, FnError, getGameState } from "@/lib/game/api";
import { useGameChannel } from "@/lib/game/use-game-channel";
import {
  loadLinePicker,
  ttsUrl,
  type HostLine,
  type HostSlot,
  type LinePicker,
} from "@/lib/game/host-lines";
import { useCreative, useImpression } from "@/lib/game/use-creative";
import type {
  GameStateName,
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

// How long the auto-host lets each beat breathe before moving on (ms).
// question/final_question advance at the server deadline via QuestionClock;
// lobby waits for a human — the night starts when the bar says so.
const AUTO_DWELL_MS: Partial<Record<GameStateName, number>> = {
  round_intro: 6_000,
  locked: 2_500,
  reveal: 9_500,
  scores: 10_000,
  intermission: 20_000,
  podium: 45_000,
};

function slotForState(s: StatePayload): HostSlot | null {
  switch (s.state) {
    case "lobby":
      return "lobby";
    case "round_intro":
      return "round_intro";
    case "locked":
      return "pre_reveal";
    case "reveal": {
      const answered = s.reveal?.teamResults.filter((t) => t.answered) ?? [];
      const correct = answered.filter((t) => t.isCorrect).length;
      // Mostly right → celebrate; mostly wrong (or silent) → tease the question.
      return answered.length > 0 && correct * 2 >= answered.length
        ? "post_reveal_correct"
        : "post_reveal_brutal";
    }
    case "intermission":
      return "intermission";
    case "final_question":
      return "final_intro";
    case "podium":
      return "podium";
    case "ended":
      return "close";
    default:
      return null; // question: the question IS the content
  }
}

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
  const [paused, setPaused] = useState(false);
  const [hostLine, setHostLine] = useState<HostLine | null>(null);
  const advancing = useRef(false);
  const pickerRef = useRef<LinePicker | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastBeatRef = useRef<string>("");

  useEffect(() => {
    let disposed = false;
    loadLinePicker().then((picker) => {
      if (!disposed) pickerRef.current = picker;
    });
    return () => {
      disposed = true;
    };
  }, []);

  const onState = useCallback((s: StatePayload) => {
    setState(s);
    setTick(null);
    setError(null);

    // One personality beat per transition (resyncs must not re-roll lines).
    const beat = `${s.state}:${s.round}:${s.position}`;
    if (beat !== lastBeatRef.current) {
      lastBeatRef.current = beat;
      const slot = slotForState(s);
      const line = slot ? (pickerRef.current?.(slot) ?? null) : null;
      setHostLine(line);
      // TTS path (feature-flagged; audio must never block a transition —
      // failures are silent by design, PRD §6).
      if (line?.tts_audio_path && s.settings.tts_enabled && audioRef.current) {
        audioRef.current.src = ttsUrl(line.tts_audio_path);
        void audioRef.current.play().catch(() => {});
      }
    }
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

  // "Finish game & exit": two presses (arm, then commit within 4s) — ends the
  // night as it stands by jumping to the podium; ended flows from there.
  const [confirmFinish, setConfirmFinish] = useState(false);
  useEffect(() => {
    if (!confirmFinish) return;
    const id = setTimeout(() => setConfirmFinish(false), 4000);
    return () => clearTimeout(id);
  }, [confirmFinish]);
  const finishGame = useCallback(async () => {
    if (!state || advancing.current) return;
    advancing.current = true;
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await advanceGame({
        gameId,
        expectedState: state.state,
        accessToken: token,
        action: "finish",
      });
      setState(res.state);
      setError(null);
    } catch (err) {
      if (!(err instanceof FnError && err.status === 409)) {
        setError(err instanceof Error ? err.message : "finish failed");
      }
      const fresh = await getGameState({ gameId }).catch(() => null);
      if (fresh) setState(fresh);
    } finally {
      advancing.current = false;
      setConfirmFinish(false);
    }
  }, [gameId, state]);

  // Sponsor slot (PRD §7): a screen creative in intermission + a strap on
  // round intros, only when the venue opted in via settings.sponsor_slot.
  const sponsorSlot = state?.settings.sponsor_slot === true;
  const creative = useCreative(sponsorSlot ? gameId : null, "screen");
  useImpression(
    creative,
    gameId,
    sponsorSlot && state?.state === "intermission",
    `intermission:${state?.round ?? 0}`,
  );

  // The auto-host: each beat advances itself after its dwell.
  const autoHost = state ? state.settings.auto_host !== false : true;
  useEffect(() => {
    if (!state || !autoHost || paused) return;
    const dwell = AUTO_DWELL_MS[state.state];
    if (!dwell) return;
    const id = setTimeout(() => void advance(), dwell);
    return () => clearTimeout(id);
  }, [state, autoHost, paused, advance]);

  // Every team is in? Don't make the room stare at a countdown — hold one
  // beat (the last lock-in deserves its moment) and cut to the lock.
  useEffect(() => {
    if (!state || !autoHost || paused || !tick) return;
    if (state.state !== "question" && state.state !== "final_question") return;
    if (!state.question || tick.questionId !== state.question.id) return;
    if (state.teams.length === 0 || tick.answeredTeams < state.teams.length) return;
    const id = setTimeout(() => void advance(), 1500);
    return () => clearTimeout(id);
  }, [state, tick, autoHost, paused, advance]);

  // Manual override (PRD §6): space advances, p pauses/resumes the engine.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        void advance();
      } else if (e.code === "KeyP") {
        e.preventDefault();
        setPaused((p) => !p);
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
    <main className="flex min-h-screen flex-col bg-zinc-950 px-16 py-10 text-zinc-50">
      {/* Hidden audio element: the TTS playback path (silent no-op without files) */}
      <audio ref={audioRef} className="hidden" />

      <header className="flex items-center justify-between text-2xl text-zinc-400">
        <span className="font-semibold uppercase tracking-widest text-amber-400">
          {state.packTitle || "TRIVIUM"}
        </span>
        <span className="flex items-center gap-6">
          <span
            data-testid="auto-status"
            data-paused={paused}
            className={`rounded-full border px-4 py-1 text-base uppercase tracking-widest ${
              !autoHost
                ? "border-zinc-800 text-zinc-400"
                : paused
                  ? "border-red-800 text-red-400"
                  : "border-zinc-700 text-zinc-400"
            }`}
          >
            {!autoHost ? "manual" : paused ? "paused — p resumes" : "auto-host"}
          </span>
          <span data-testid="console-state" data-state={state.state}>
            {state.state !== "lobby" && state.round >= 1 && state.round <= state.rounds
              ? `Round ${state.round}`
              : ""}
            {state.question?.isFinal ? "Final question" : ""}
          </span>
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
                <p
                  className="font-mono text-[120px] font-black leading-none tracking-widest text-amber-400"
                  data-testid="join-code"
                >
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
          <div className="flex flex-col items-center gap-6">
            <h1 className="animate-beat-in text-7xl font-black">Round {state.round}</h1>
            {sponsorSlot && creative && (
              <p className="text-2xl text-zinc-400" data-testid="sponsor-strap">
                brought to you by{" "}
                <span className="font-semibold text-zinc-300">{creative.headline}</span>
              </p>
            )}
          </div>
        )}

        {(state.state === "question" || state.state === "final_question") &&
          state.question && (
            <div className="flex w-full max-w-6xl animate-beat-in flex-col items-center gap-10">
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
                {state.deadlineTs ? (
                  <QuestionClock
                    key={state.deadlineTs}
                    deadlineTs={state.deadlineTs}
                    serverNowTs={state.serverNowTs}
                    onExpire={advance}
                  />
                ) : null}
                <span data-testid="answered-tick">
                  {tick?.questionId === state.question.id ? tick.answeredTeams : 0}/
                  {state.teams.length} teams in
                </span>
              </div>
            </div>
          )}

        {state.state === "locked" && state.question && (
          <div className="flex w-full max-w-6xl flex-col items-center gap-10">
            <h1 className="text-[64px] font-bold leading-tight text-zinc-400">
              {state.question.prompt}
            </h1>
            <p className="animate-beat-in text-5xl font-black text-red-400">Answers locked</p>
          </div>
        )}

        {state.state === "reveal" && state.question && state.reveal && (
          <RevealPanel key={state.question.id} state={state} />
        )}

        {(state.state === "scores" ||
          state.state === "intermission" ||
          state.state === "podium") && (
          <div className="flex w-full max-w-4xl animate-beat-in flex-col items-center gap-8">
            <h1 className="text-6xl font-black">
              {state.state === "podium" ? "Final standings" : `Scores — round ${state.round}`}
            </h1>
            {state.state === "intermission" && sponsorSlot && creative && (
              <aside
                data-testid="sponsor-panel"
                className="flex w-full max-w-3xl flex-col gap-1 rounded-2xl border border-zinc-700 bg-zinc-900 px-8 py-5 text-center"
              >
                <p className="text-sm uppercase tracking-widest text-zinc-400">
                  tonight&apos;s sponsor
                </p>
                <p className="text-4xl font-bold text-zinc-100">{creative.headline}</p>
                {creative.body && <p className="text-2xl text-zinc-400">{creative.body}</p>}
              </aside>
            )}
            <ol className="w-full text-[36px]" data-testid="leaderboard">
              {state.leaderboard.map((t, i) => (
                <li
                  key={t.teamId}
                  data-team={t.name}
                  data-score={t.score}
                  style={{ transitionDelay: `${i * 120}ms` }}
                  className="flex justify-between border-b border-zinc-800 py-3"
                >
                  <span>
                    <span
                      className={`mr-6 font-black ${
                        state.state === "podium" && t.rank === 1
                          ? "text-5xl text-amber-300"
                          : "text-amber-400"
                      }`}
                    >
                      {t.rank}
                    </span>
                    {t.name}
                  </span>
                  <span className="font-bold">{t.score}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {state.state === "ended" && (
          <h1 className="animate-beat-in text-6xl font-black" data-testid="ended-screen">
            That&apos;s the night — thanks for playing!
          </h1>
        )}
      </section>

      {hostLine && (
        <p
          data-testid="host-line"
          className="animate-beat-in mx-auto max-w-5xl pb-4 text-center text-3xl italic text-amber-200/90"
        >
          {hostLine.text}
        </p>
      )}

      {error && (
        <p
          role="alert"
          data-testid="console-error"
          className="mx-auto rounded-lg border border-red-900 bg-red-950 px-4 py-2 text-xl text-red-300"
        >
          {error} — resynced; try again or check the wifi.
        </p>
      )}

      <footer className="flex items-center justify-between text-zinc-400">
        <span className="text-xl">
          Join: {joinUrl} · code {state.joinCode}
        </span>
        <span className="flex items-center gap-3">
          {!["lobby", "podium", "ended", "abandoned"].includes(state.state) && (
            <button
              type="button"
              data-testid="finish-game-button"
              onClick={() => (confirmFinish ? void finishGame() : setConfirmFinish(true))}
              className={
                confirmFinish
                  ? "rounded-xl border border-red-700 bg-red-950 px-5 py-3 text-xl font-semibold text-red-300"
                  : "rounded-xl border border-zinc-800 px-5 py-3 text-xl text-zinc-500 hover:border-red-800 hover:text-red-400"
              }
            >
              {confirmFinish ? "Press again to finish" : "Finish game & exit"}
            </button>
          )}
          {state.state === "ended" && (
            <a
              href="/dashboard"
              className="rounded-xl border border-zinc-700 px-6 py-3 text-2xl text-zinc-300 hover:border-amber-400"
            >
              Back to dashboard
            </a>
          )}
          {state.state !== "ended" && state.state !== "abandoned" && (
            <button
              type="button"
              data-testid="advance-button"
              onClick={() => void advance()}
              className="rounded-xl border border-zinc-700 px-6 py-3 text-2xl text-zinc-300 hover:border-amber-400"
            >
              {ADVANCE_LABEL[state.state] ?? "Advance"} <kbd className="ml-2 text-zinc-400">space</kbd>
            </button>
          )}
        </span>
      </footer>
    </main>
  );
}

// Reveal choreography (PRD §6): options dim → 1.5s hold → answer highlight +
// source note → score deltas stagger in.
function RevealPanel({ state }: { state: StatePayload }) {
  const [phase, setPhase] = useState<"dim" | "answer" | "deltas">("dim");
  useEffect(() => {
    const t1 = setTimeout(() => setPhase("answer"), 1500);
    const t2 = setTimeout(() => setPhase("deltas"), 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const q = state.question!;
  const reveal = state.reveal!;
  const showAnswer = phase !== "dim";

  return (
    <div className="flex w-full max-w-6xl flex-col items-center gap-8">
      <p className="text-4xl text-zinc-400">{q.prompt}</p>

      {q.options && (
        <ol className="grid w-full grid-cols-2 gap-6 text-left text-[40px]">
          {q.options.map((opt, i) => {
            const isCorrect = typeof reveal.answer === "number" && reveal.answer === i;
            return (
              <li
                key={i}
                className={`rounded-2xl border px-8 py-4 transition-all duration-500 ${
                  showAnswer && isCorrect
                    ? "border-emerald-400 bg-emerald-950 text-emerald-200"
                    : "border-zinc-800 bg-zinc-900/60 text-zinc-400"
                }`}
              >
                <span className={`mr-4 font-black ${showAnswer && isCorrect ? "text-emerald-300" : "text-zinc-400"}`}>
                  {String.fromCharCode(65 + i)}
                </span>
                {opt}
              </li>
            );
          })}
        </ol>
      )}

      <div
        className={`flex flex-col items-center gap-3 transition-all duration-700 ${
          showAnswer ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        }`}
      >
        <h1 className="text-7xl font-black text-emerald-400" data-testid="reveal-answer">
          {formatAnswer(state)}
        </h1>
        {reveal.answerNote && (
          <p className="text-3xl text-zinc-400">{reveal.answerNote}</p>
        )}
      </div>

      <ul
        data-testid="reveal-teams"
        className={`w-full max-w-3xl text-4xl transition-opacity duration-700 ${
          phase === "deltas" ? "opacity-100" : "opacity-0"
        }`}
      >
        {reveal.teamResults.map((t) => (
          <li key={t.teamId} className="flex justify-between border-b border-zinc-800 py-2">
            <span>{t.name}</span>
            <span
              className={
                !t.answered
                  ? "text-zinc-400"
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

  return (
    <span data-testid="console-clock" className={secondsLeft <= 5 ? "font-black text-red-400" : ""}>
      {secondsLeft}s
    </span>
  );
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
