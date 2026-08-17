// API-level guarantees of the answers gate (PRD §3/§5): client-uuid retries
// are idempotent, a second teammate hits team-lock, late answers bounce off
// the server clock. No browser — this drives the same client module the app
// uses, straight at the edge functions.
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { adminClient } from "./helpers/admin";
import { seedSyntheticNight } from "./helpers/fixtures";
import { hostAccessToken } from "./helpers/auth";
import { advanceGame, FnError, joinGame, submitAnswer } from "../src/lib/game/api";

test("answers are idempotent, team-locked, and deadline-enforced", async () => {
  test.setTimeout(120_000);
  const night = await seedSyntheticNight();
  const token = await hostAccessToken(night.hostEmail);

  const alice = await joinGame({
    code: night.joinCode,
    displayName: "Alice",
    teamName: "API Raiders",
  });
  const bob = await joinGame({
    code: night.joinCode,
    displayName: "Bob",
    teamId: alice.teamId,
  });

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

  // A teammate's separate attempt hits the team lock (first answer locks).
  await expect(
    submitAnswer({
      answerId: randomUUID(),
      gameId: night.gameId,
      questionId: q1.id,
      playerId: bob.playerId,
      deviceKey: bob.deviceKey,
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
