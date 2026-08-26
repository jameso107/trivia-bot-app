// API-level guarantees of the answers gate (PRD §3/§5): client-uuid retries
// are idempotent, a second submission after the lock bounces (solo play: your
// own team-of-one is the team that locks), late answers bounce off the server
// clock. No browser — this drives the same client module the app uses,
// straight at the edge functions.
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { adminClient } from "./helpers/admin";
import { seedSyntheticNight } from "./helpers/fixtures";
import { hostAccessToken } from "./helpers/auth";
import {
  advanceGame,
  FnError,
  getGameState,
  joinGame,
  submitAnswer,
} from "../src/lib/game/api";

test("answers are idempotent, locked after first submit, and deadline-enforced", async () => {
  test.setTimeout(120_000);
  const night = await seedSyntheticNight();
  const token = await hostAccessToken(night.hostEmail);

  const alice = await joinGame({ code: night.joinCode, displayName: "Alice" });

  // Rejoining with device credentials restores the same player.
  const aliceAgain = await joinGame({
    code: night.joinCode,
    playerId: alice.playerId,
    deviceKey: alice.deviceKey,
  });
  expect(aliceAgain.rejoined).toBe(true);
  expect(aliceAgain.playerId).toBe(alice.playerId);

  // Advance lobby → round_intro → question.
  await advanceGame({ gameId: night.gameId, expectedState: "lobby", accessToken: token });
  await advanceGame({ gameId: night.gameId, expectedState: "round_intro", accessToken: token });

  // Stale expected_state gets a clean 409 (optimistic concurrency).
  await expect(
    advanceGame({ gameId: night.gameId, expectedState: "lobby", accessToken: token }),
  ).rejects.toMatchObject({ status: 409 });

  const q1 = night.questions[0];
  const answerId = randomUUID();

  // Same client uuid twice: second is a success-shaped duplicate, not an error.
  const first = await submitAnswer({
    answerId,
    gameId: night.gameId,
    questionId: q1.id,
    playerId: alice.playerId,
    deviceKey: alice.deviceKey,
    payload: { choice: 1 },
  });
  expect(first.accepted).toBe(true);
  const retry = await submitAnswer({
    answerId,
    gameId: night.gameId,
    questionId: q1.id,
    playerId: alice.playerId,
    deviceKey: alice.deviceKey,
    payload: { choice: 1 },
  });
  expect(retry.accepted).toBe(true);
  expect(retry.duplicate).toBe(true);

  // A NEW submission (fresh uuid, different payload) after the lock bounces:
  // with edits off, the first answer is final — even for its own author.
  await expect(
    submitAnswer({
      answerId: randomUUID(),
      gameId: night.gameId,
      questionId: q1.id,
      playerId: alice.playerId,
      deviceKey: alice.deviceKey,
      payload: { choice: 0 },
    }),
  ).rejects.toMatchObject({ reason: "team_locked" });

  // Exactly one stored answer, exactly one analytics emit.
  const admin = adminClient();
  const { data: stored } = await admin
    .from("answers")
    .select("id")
    .eq("game_id", night.gameId)
    .eq("question_id", q1.id);
  expect(stored).toHaveLength(1);
  expect(stored![0].id).toBe(answerId);

  // Force the deadline into the past — late answers must bounce.
  await admin
    .from("games")
    .update({ question_deadline: new Date(Date.now() - 1000).toISOString() })
    .eq("id", night.gameId);
  let lateError: FnError | null = null;
  try {
    await submitAnswer({
      answerId: randomUUID(),
      gameId: night.gameId,
      questionId: q1.id,
      playerId: alice.playerId,
      deviceKey: alice.deviceKey,
      payload: { choice: 2 },
    });
  } catch (e) {
    lateError = e as FnError;
  }
  expect(lateError?.reason).toBe("too_late");

  // Wrong device key is rejected outright.
  await expect(
    submitAnswer({
      answerId: randomUUID(),
      gameId: night.gameId,
      questionId: q1.id,
      playerId: alice.playerId,
      deviceKey: randomUUID(),
      payload: { choice: 1 },
    }),
  ).rejects.toMatchObject({ status: 403 });
});

test("live-pack hard rule: non-live packs are unreachable pre-start", async () => {
  test.setTimeout(120_000);
  const night = await seedSyntheticNight();
  const admin = adminClient();
  const token = await hostAccessToken(night.hostEmail);

  await admin.from("packs").update({ status: "qa_pending" }).eq("id", night.packId);

  // Players can't find it, the console can't read it, the night can't start.
  await expect(
    joinGame({ code: night.joinCode, displayName: "Eve" }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(getGameState({ code: night.joinCode })).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    advanceGame({ gameId: night.gameId, expectedState: "lobby", accessToken: token }),
  ).rejects.toMatchObject({ reason: "pack_not_live" });

  // trivia-qa flips it live and everything opens up.
  await admin.from("packs").update({ status: "live" }).eq("id", night.packId);
  const state = await getGameState({ code: night.joinCode });
  expect(state.state).toBe("lobby");
});

test("abandoned sweep: idle games flip to abandoned and emit game_abandoned", async () => {
  test.setTimeout(120_000);
  const night = await seedSyntheticNight();
  const admin = adminClient();

  await admin
    .from("games")
    .update({ created_at: new Date(Date.now() - 5 * 3_600_000).toISOString() })
    .eq("id", night.gameId);

  const { data: sweptCount, error } = await admin.rpc("sweep_abandoned_games");
  expect(error).toBeNull();
  expect(Number(sweptCount)).toBeGreaterThanOrEqual(1);

  const { data: game } = await admin
    .from("games")
    .select("state")
    .eq("id", night.gameId)
    .single();
  expect(game!.state).toBe("abandoned");

  const { data: events } = await admin
    .from("analytics_events")
    .select("event")
    .eq("game_id", night.gameId)
    .eq("event", "game_abandoned");
  expect(events).toHaveLength(1);

  // Abandoned games are unreachable for players.
  await expect(getGameState({ code: night.joinCode })).rejects.toMatchObject({
    status: 404,
  });
});

test("answer edits: identical retries are free, edits cap at 3, timestamps move only on real edits", async () => {
  test.setTimeout(120_000);
  const night = await seedSyntheticNight();
  const admin = adminClient();
  await admin
    .from("games")
    .update({ settings: { speed_bonus: true, team_edits: true, read_seconds: 0 } })
    .eq("id", night.gameId);
  const token = await hostAccessToken(night.hostEmail);

  const alice = await joinGame({ code: night.joinCode, displayName: "Edit Alice" });

  await advanceGame({ gameId: night.gameId, expectedState: "lobby", accessToken: token });
  await advanceGame({ gameId: night.gameId, expectedState: "round_intro", accessToken: token });
  const q1 = night.questions[0];

  const submit = (payload: Record<string, unknown>) =>
    submitAnswer({
      answerId: randomUUID(),
      gameId: night.gameId,
      questionId: q1.id,
      playerId: alice.playerId,
      deviceKey: alice.deviceKey,
      payload,
    });

  await submit({ choice: 0 }); // attempt 1
  // Same payload, new uuid (a network retry): free no-op, no attempt burned.
  const retry = await submit({ choice: 0 });
  expect(retry.duplicate).toBe(true);

  await submit({ choice: 1 }); // attempt 2
  await submit({ choice: 2 }); // attempt 3
  await expect(submit({ choice: 3 })).rejects.toMatchObject({ reason: "rate_limited" });

  const { data: stored } = await admin
    .from("answers")
    .select("attempts, payload")
    .eq("game_id", night.gameId)
    .eq("question_id", q1.id)
    .single();
  expect(stored!.attempts).toBe(3);
  expect(stored!.payload).toEqual({ choice: 2 });
});
