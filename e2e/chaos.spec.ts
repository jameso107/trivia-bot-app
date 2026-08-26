// Chaos pass (PRD §10 M7): the failure modes a real bar produces.
import { expect, test } from "@playwright/test";
import { adminClient } from "./helpers/admin";
import { seedSyntheticNight } from "./helpers/fixtures";
import { hostAccessToken, loginAsHost } from "./helpers/auth";
import { advanceUntil } from "./helpers/drive";
import { advanceGame, getGameState } from "../src/lib/game/api";
import { join, newPlayer } from "./helpers/players";

test("console dies mid-reveal and comes back: state restored, night continues", async ({
  browser,
  page: hostPage,
}) => {
  test.setTimeout(180_000);
  const night = await seedSyntheticNight();
  const token = await hostAccessToken(night.hostEmail);

  await loginAsHost(hostPage, night.hostEmail);
  await hostPage.goto(`/host/${night.gameId}`);
  await expect(hostPage.getByTestId("join-code")).toBeVisible({ timeout: 15000 });

  const p1 = await newPlayer(browser, night.joinCode);
  await join(p1, "Ada");

  // Play to a reveal with an answer on the board.
  await advanceGame({ gameId: night.gameId, expectedState: "lobby", accessToken: token });
  await advanceGame({ gameId: night.gameId, expectedState: "round_intro", accessToken: token });
  await expect(p1.getByTestId("answer-form")).toBeVisible({ timeout: 15000 });
  await p1.getByTestId("option-1").click();
  await expect(p1.getByTestId("answer-locked")).toBeVisible({ timeout: 10000 });
  await advanceGame({ gameId: night.gameId, expectedState: "question", accessToken: token });
  await advanceGame({ gameId: night.gameId, expectedState: "locked", accessToken: token });

  // The TV browser dies mid-reveal...
  await expect(hostPage.getByTestId("reveal-answer")).toBeVisible({ timeout: 15000 });
  await hostPage.close();

  // ...the bartender reopens it: reveal restored from the DB, scores intact,
  // and the night keeps moving.
  const hostPage2 = await (await browser.newContext()).newPage();
  await loginAsHost(hostPage2, night.hostEmail);
  await hostPage2.goto(`/host/${night.gameId}`);
  await expect(hostPage2.getByTestId("console-state")).toHaveAttribute("data-state", "reveal", {
    timeout: 15000,
  });
  await expect(hostPage2.getByTestId("reveal-answer")).toContainText("Mars");
  await hostPage2.getByTestId("advance-button").click();
  await expect(hostPage2.getByTestId("console-state")).toHaveAttribute(
    "data-state",
    "question",
    { timeout: 15000 },
  );

  // Scoring survived the crash exactly once (idempotent reveal).
  const admin = adminClient();
  const { data: answers } = await admin
    .from("answers")
    .select("points, is_correct")
    .eq("game_id", night.gameId)
    .not("points", "is", null);
  expect(answers).toHaveLength(1);
  expect(answers![0].is_correct).toBe(true);
});

test("two consoles race an advance: one wins, one 409s, state converges", async () => {
  test.setTimeout(120_000);
  const night = await seedSyntheticNight();
  const token = await hostAccessToken(night.hostEmail);

  await advanceGame({ gameId: night.gameId, expectedState: "lobby", accessToken: token });

  // Both fire round_intro → question simultaneously.
  const results = await Promise.allSettled([
    advanceGame({ gameId: night.gameId, expectedState: "round_intro", accessToken: token }),
    advanceGame({ gameId: night.gameId, expectedState: "round_intro", accessToken: token }),
  ]);
  const wins = results.filter((r) => r.status === "fulfilled").length;
  const conflicts = results.filter(
    (r) =>
      r.status === "rejected" &&
      (r.reason as { status?: number }).status === 409,
  ).length;
  expect(wins).toBe(1);
  expect(conflicts).toBe(1);

  const state = await getGameState({ gameId: night.gameId });
  expect(state.state).toBe("question");
  expect(state.round).toBe(1);
  expect(state.position).toBe(1);

  // And the night still finishes cleanly after the scuffle.
  await advanceUntil(night.gameId, token, "ended");
});
