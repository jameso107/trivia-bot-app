// Thin typed client for the game edge functions. Players call these
// anonymously (device credentials in the body); the console passes the venue
// member's access token for advance-game.
import type { StatePayload } from "../../../supabase/functions/_shared/protocol.ts";

const FN_BASE = () => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
const ANON_KEY = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export class FnError extends Error {
  status: number;
  reason?: string;
  constructor(message: string, status: number, reason?: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

async function callFn<T>(
  name: string,
  init: { method: "GET" | "POST"; body?: unknown; query?: Record<string, string>; accessToken?: string },
): Promise<T> {
  const qs = init.query ? `?${new URLSearchParams(init.query)}` : "";
  const res = await fetch(`${FN_BASE()}/${name}${qs}`, {
    method: init.method,
    headers: {
      apikey: ANON_KEY(),
      Authorization: `Bearer ${init.accessToken ?? ANON_KEY()}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new FnError(
      typeof data.error === "string" ? data.error : `request failed (${res.status})`,
      res.status,
      typeof data.reason === "string" ? data.reason : undefined,
    );
  }
  return data as T;
}

export interface JoinResult {
  gameId: string;
  playerId: string;
  teamId: string;
  deviceKey: string;
  displayName: string;
  rejoined: boolean;
  state: StatePayload;
}

export function joinGame(params: {
  code: string;
  displayName?: string;
  teamId?: string;
  teamName?: string;
  playerId?: string;
  deviceKey?: string;
}): Promise<JoinResult> {
  return callFn<JoinResult>("join-game", { method: "POST", body: params });
}

export function getGameState(by: { gameId?: string; code?: string }): Promise<StatePayload> {
  return callFn<StatePayload>("game-state", {
    method: "GET",
    query: by.gameId ? { gameId: by.gameId } : { code: by.code! },
  });
}

export function submitAnswer(params: {
  answerId: string;
  gameId: string;
  questionId: string;
  playerId: string;
  deviceKey: string;
  payload: Record<string, unknown>;
}): Promise<{ accepted: boolean; duplicate?: boolean }> {
  return callFn("submit-answer", { method: "POST", body: params });
}

export function advanceGame(params: {
  gameId: string;
  expectedState: string;
  accessToken: string;
}): Promise<{ ok: boolean; state: StatePayload }> {
  return callFn("advance-game", {
    method: "POST",
    body: { gameId: params.gameId, expectedState: params.expectedState },
    accessToken: params.accessToken,
  });
}
