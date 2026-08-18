"use client";

// The phone. Join → answer → see how your team is doing. Device credentials
// live in localStorage so a dropped connection or closed tab resumes the same
// player (PRD §3 resilience; answers stay idempotent via client uuids).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FnError,
  getGameState,
  joinGame,
  submitAnswer,
  type JoinResult,
} from "@/lib/game/api";
import { useGameChannel } from "@/lib/game/use-game-channel";
import { createClient } from "@/lib/supabase/client";
import { useCreative, useImpression } from "@/lib/game/use-creative";
import { SaveMoment } from "./save-moment";
import type {
  LobbyEvent,
  StatePayload,
  TeamSummary,
} from "../../../../supabase/functions/_shared/protocol.ts";

interface Identity {
  gameId: string;
  playerId: string;
  teamId: string;
  deviceKey: string;
  displayName: string;
}

// One flag for "this question is settled for me", with why — the render and
// every write path share it, so the UI can't disagree with itself.
interface AnswerLock {
  questionId: string;
  by: "me" | "teammate" | "time";
}

const storageKey = (code: string) => `tb:player:${code}`;

function loadIdentity(code: string): Identity | null {
  try {
    const raw = localStorage.getItem(storageKey(code));
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}

function storeIdentity(code: string, id: Identity) {
  // Private-mode/embedded browsers can refuse storage; the join itself
  // already succeeded server-side, so never let persistence sink it —
  // the session just won't survive a reload.
  try {
    localStorage.setItem(storageKey(code), JSON.stringify(id));
  } catch {
    /* non-fatal */
  }
}

export function PlayerGame({ code }: { code: string }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [bootGameId, setBootGameId] = useState<string | null>(null);
  const [state, setState] = useState<StatePayload | null>(null);
  const [formTeams, setFormTeams] = useState<TeamSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"boot" | "form" | "joining" | "in">("boot");
  const [lock, setLock] = useState<AnswerLock | null>(null);
  const sendingRef = useRef(false);

  function applyJoin(res: JoinResult) {
    const id: Identity = {
      gameId: res.gameId,
      playerId: res.playerId,
      teamId: res.teamId,
      deviceKey: res.deviceKey,
      displayName: res.displayName,
    };
    storeIdentity(code, id);
    setIdentity(id);
    setState(res.state);
    setFormTeams(res.state.teams);
    setPhase("in");
  }

  // Boot: resume a stored identity or show the join form (with live teams).
  useEffect(() => {
    const stored = loadIdentity(code);
    if (!stored) {
      getGameState({ code })
        .then((s) => {
          setState(s);
          setBootGameId(s.gameId);
          setFormTeams(s.teams);
          setPhase("form");
        })
        .catch((e) => {
          setError(
            e instanceof FnError && e.status === 404
              ? "No game with that code."
              : "Couldn't reach the game — try again.",
          );
          setPhase("form");
        });
      return;
    }
    joinGame({ code, playerId: stored.playerId, deviceKey: stored.deviceKey })
      .then((res) => {
        applyJoin(res);
      })
      .catch(() => {
        try {
          localStorage.removeItem(storageKey(code));
        } catch {
          /* non-fatal */
        }
        getGameState({ code })
          .then((s) => {
            setState(s);
            setBootGameId(s.gameId);
            setFormTeams(s.teams);
          })
          .catch(() => {});
        setPhase("form");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const onState = useCallback((s: StatePayload) => {
    setState(s);
    setFormTeams(s.teams);
    // A lock only applies to the question it was placed on.
    setLock((prev) =>
      prev && s.question && prev.questionId === s.question.id ? prev : null,
    );
  }, []);
  const onLobby = useCallback((e: LobbyEvent) => {
    setFormTeams(e.teams);
    setState((prev) =>
      prev ? { ...prev, playerCount: e.playerCount, teams: e.teams } : prev,
    );
  }, []);

  // Subscribed from the moment we know the game (even pre-join, so the form's
  // team list stays live). Boot/join responses carried state already.
  useGameChannel(identity?.gameId ?? bootGameId, { onState, onLobby }, { skipFirstResync: true });

  // Between rounds, one tasteful phone-surface card (house ads v1, PRD §7).
  const betweenRounds = state?.state === "scores" || state?.state === "intermission";
  const phoneCreative = useCreative(identity?.gameId ?? null, "phone");
  useImpression(
    phoneCreative,
    identity?.gameId ?? null,
    Boolean(betweenRounds),
    `between:${state?.round ?? 0}`,
  );

  async function handleJoin(formData: FormData) {
    setError(null);
    setPhase("joining");
    const displayName = String(formData.get("displayName") ?? "");
    const teamChoice = String(formData.get("team") ?? "__new__");
    const teamName = String(formData.get("teamName") ?? "");
    try {
      const res = await joinGame({
        code,
        displayName,
        ...(teamChoice === "__new__" ? { teamName } : { teamId: teamChoice }),
      });
      applyJoin(res);
    } catch (e) {
      setError(e instanceof FnError ? e.message : "Couldn't join — try again.");
      setPhase("form");
    }
  }

  async function sendAnswer(payload: Record<string, unknown>) {
    if (!identity || !state?.question || sendingRef.current) return;
    const question = state.question;
    sendingRef.current = true;
    setLock({ questionId: question.id, by: "me" }); // optimistic
    try {
      await submitAnswer({
        answerId: crypto.randomUUID(),
        gameId: identity.gameId,
        questionId: question.id,
        playerId: identity.playerId,
        deviceKey: identity.deviceKey,
        payload,
      });
    } catch (e) {
      if (e instanceof FnError && e.reason === "team_locked") {
        setLock({ questionId: question.id, by: "teammate" });
      } else if (e instanceof FnError && e.reason === "too_late") {
        setLock({ questionId: question.id, by: "time" });
      } else {
        setLock(null);
        setError("That didn't go through — tap again.");
      }
    } finally {
      sendingRef.current = false;
    }
  }

  const myStanding = useMemo(() => {
    if (!state || !identity) return null;
    return state.leaderboard.find((t) => t.teamId === identity.teamId) ?? null;
  }, [state, identity]);

  if (phase === "boot" || phase === "joining") {
    return (
      <Shell>
        <p className="text-xl text-zinc-400">One sec…</p>
      </Shell>
    );
  }

  if (phase === "form") {
    return (
      <Shell>
        <form action={handleJoin} className="flex w-full flex-col gap-4" data-testid="join-form">
          <h1 className="text-2xl font-bold">Join game {code}</h1>
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            Your name
            <input
              name="displayName"
              required
              maxLength={24}
              autoComplete="off"
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-lg"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            Team
            <select
              name="team"
              defaultValue="__new__"
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-lg"
            >
              <option value="__new__">Start a new team…</option>
              {formTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.playerCount})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            New team name (if starting one)
            <input
              name="teamName"
              maxLength={24}
              autoComplete="off"
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-lg"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="rounded-xl bg-amber-400 px-4 py-4 text-lg font-bold text-zinc-950"
          >
            Let&apos;s play
          </button>
        </form>
      </Shell>
    );
  }

  if (!state) {
    return (
      <Shell>
        <p className="text-xl text-zinc-400">Syncing…</p>
      </Shell>
    );
  }

  const q = state.question;
  const isOpen = state.state === "question" || state.state === "final_question";
  const activeLock = q && lock && lock.questionId === q.id ? lock : null;

  const lockCopy: Record<AnswerLock["by"], { title: string; body: string }> = {
    me: { title: "Locked in", body: "Answer is in — eyes on the screen." },
    teammate: { title: "Locked in", body: "A teammate answered for your team." },
    time: { title: "Time!", body: "Answers are locked for this one." },
  };

  return (
    <Shell>
      <div
        className="flex w-full flex-col gap-6"
        data-testid="player-screen"
        data-state={state.state}
      >
        <header className="flex items-center justify-between text-sm text-zinc-400">
          <span>{identity?.displayName}</span>
          <span data-testid="player-team">
            {state.teams.find((t) => t.id === identity?.teamId)?.name}
          </span>
        </header>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        {state.state === "lobby" && (
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-2xl font-bold">You&apos;re in!</h1>
            <p className="text-zinc-400">Watch the big screen — the night starts soon.</p>
            <p className="text-sm text-zinc-400" data-testid="lobby-count">
              {state.playerCount} players · {state.teams.length} teams
            </p>
          </div>
        )}

        {(state.state === "round_intro" ||
          state.state === "intermission" ||
          state.state === "scores") && (
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-2xl font-bold">
              {state.state === "round_intro" ? `Round ${state.round}` : "Standings"}
            </h1>
            {myStanding && (
              <p className="text-lg text-zinc-300" data-testid="my-standing">
                {myStanding.name}: #{myStanding.rank} · {myStanding.score} pts
              </p>
            )}
            {betweenRounds && phoneCreative && (
              <aside
                data-testid="phone-ad"
                className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-left"
              >
                <p className="text-[10px] uppercase tracking-widest text-zinc-400">ad</p>
                <p className="font-semibold text-zinc-200">{phoneCreative.headline}</p>
                {phoneCreative.body && (
                  <p className="text-sm text-zinc-400">{phoneCreative.body}</p>
                )}
              </aside>
            )}
          </div>
        )}

        {isOpen && q && !activeLock && (
          <AnswerForm key={q.id} question={q} onSubmit={(payload) => void sendAnswer(payload)} />
        )}

        {isOpen && q && activeLock && (
          <div className="flex flex-col gap-2 text-center" data-testid="answer-locked">
            <h1
              className={`text-2xl font-bold ${activeLock.by === "time" ? "text-zinc-300" : "text-emerald-400"}`}
            >
              {lockCopy[activeLock.by].title}
            </h1>
            <p className="text-zinc-400">{lockCopy[activeLock.by].body}</p>
          </div>
        )}

        {state.state === "locked" && (
          <div className="text-center text-2xl font-bold text-zinc-300">Answers locked…</div>
        )}

        {state.state === "reveal" && state.reveal && identity && (
          <RevealCard state={state} identity={identity} />
        )}

        {state.state === "podium" && myStanding && (
          <div className="flex flex-col gap-2 text-center" data-testid="podium">
            <h1 className="text-3xl font-black">
              {myStanding.rank === 1 ? "🏆 Champions!" : `#${myStanding.rank}`}
            </h1>
            <p className="text-lg text-zinc-300">
              {myStanding.name} — {myStanding.score} pts
            </p>
          </div>
        )}

        {state.state === "ended" && identity && <SaveMoment identity={identity} />}
      </div>
    </Shell>
  );
}

function AnswerForm({
  question,
  onSubmit,
}: {
  question: NonNullable<StatePayload["question"]>;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [wager, setWager] = useState(0);
  const wagerPart = question.isFinal ? { wager } : {};

  return (
    <div className="flex flex-col gap-4" data-testid="answer-form">
      <h1 className="text-xl font-bold leading-snug">{question.prompt}</h1>

      {question.isFinal && (
        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Wager (0–100, up to what your team has)
          <input
            type="number"
            min={0}
            max={100}
            value={wager}
            data-testid="wager-input"
            onChange={(e) => setWager(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-lg"
          />
        </label>
      )}

      {question.format === "multiple_choice" && question.options && (
        <div className="flex flex-col gap-3">
          {question.options.map((opt, i) => (
            <button
              key={i}
              type="button"
              data-testid={`option-${i}`}
              onClick={() => onSubmit({ choice: i, ...wagerPart })}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-4 text-left text-lg hover:border-amber-400"
            >
              <span className="mr-3 font-black text-amber-400">
                {String.fromCharCode(65 + i)}
              </span>
              {opt}
            </button>
          ))}
        </div>
      )}

      {question.format === "true_false" && (
        <div className="grid grid-cols-2 gap-3">
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              data-testid={`option-${v}`}
              onClick={() => onSubmit({ choice: v, ...wagerPart })}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-6 text-xl font-bold hover:border-amber-400"
            >
              {v ? "True" : "False"}
            </button>
          ))}
        </div>
      )}

      {question.format === "number_closest" && (
        <form
          action={(fd) => onSubmit({ value: Number(fd.get("value")), ...wagerPart })}
          className="flex flex-col gap-3"
        >
          <input
            name="value"
            type="number"
            step="any"
            required
            data-testid="number-input"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-lg"
            placeholder="Closest number wins"
          />
          <button
            type="submit"
            className="rounded-xl bg-amber-400 px-4 py-3 text-lg font-bold text-zinc-950"
          >
            Lock it in
          </button>
        </form>
      )}

      {question.format === "open_text" && (
        <form
          action={(fd) => onSubmit({ text: String(fd.get("text") ?? ""), ...wagerPart })}
          className="flex flex-col gap-3"
        >
          <input
            name="text"
            required
            maxLength={80}
            data-testid="text-input"
            autoComplete="off"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-lg"
            placeholder="Type your answer"
          />
          <button
            type="submit"
            className="rounded-xl bg-amber-400 px-4 py-3 text-lg font-bold text-zinc-950"
          >
            Lock it in
          </button>
        </form>
      )}
    </div>
  );
}

function RevealCard({ state, identity }: { state: StatePayload; identity: Identity }) {
  const [challenge, setChallenge] = useState<"idle" | "filing" | "filed" | "failed">("idle");
  const reveal = state.reveal!;
  const mine = reveal.teamResults.find((t) => t.teamId === identity.teamId);
  const verdict = !mine?.answered
    ? { text: "No answer this time", cls: "text-zinc-400" }
    : mine.isCorrect
      ? { text: `Correct! +${mine.points}`, cls: "text-emerald-400" }
      : { text: mine.points < 0 ? `Wrong — ${mine.points}` : "Wrong — 0", cls: "text-red-400" };

  async function fileChallenge() {
    if (challenge !== "idle") return;
    setChallenge("filing");
    const supabase = createClient();
    const { error } = await supabase.rpc("file_dispute", {
      p_game_id: identity.gameId,
      p_question_id: reveal.questionId,
      p_player_id: identity.playerId,
      p_device_key: identity.deviceKey,
    });
    setChallenge(error ? "failed" : "filed");
  }

  return (
    <div className="flex flex-col gap-2 text-center" data-testid="reveal-card">
      <h1 className={`text-3xl font-black ${verdict.cls}`} data-testid="reveal-verdict">
        {verdict.text}
      </h1>
      <p className="text-zinc-400">Answer + source on the big screen.</p>
      {/* The one-tap challenge (PRD §4): lands in trivia-qa's dispute queue. */}
      {challenge === "filed" ? (
        <p className="text-sm text-amber-300" data-testid="challenge-filed">
          Challenge filed — a human ruling lands within 24h.
        </p>
      ) : challenge === "failed" ? (
        <p className="text-sm text-zinc-400">Your team already challenged this one.</p>
      ) : (
        <button
          type="button"
          data-testid="challenge-button"
          onClick={() => void fileChallenge()}
          disabled={challenge === "filing"}
          className="mx-auto text-sm text-zinc-400 underline decoration-dotted hover:text-amber-300 disabled:opacity-50"
        >
          Think we&apos;re wrong? Challenge this question
        </button>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-5 py-10">
      {children}
    </main>
  );
}
