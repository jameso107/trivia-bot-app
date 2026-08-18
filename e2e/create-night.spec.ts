// M2 gate (PRD §10): a venue creates a night FROM THE LIVE LIBRARY and plays
// it. Exercises: seeded library packs → dashboard cards → create_game RPC
// (join-code allocation + game_created emit) → console lobby → real players
// answering a real library question through reveal.
import { expect, test } from "@playwright/test";
import { adminClient } from "./helpers/admin";
import { seedVenueHost } from "./helpers/fixtures";
import { loginAsHost } from "./helpers/auth";
import { advanceTo, joinNewTeam, newPlayer } from "./helpers/players";

test("a venue creates a night from the library and plays it", async ({
  browser,
  page: hostPage,
}) => {
  test.setTimeout(180_000);
  const seed = await seedVenueHost();

  // Dashboard: the seeded library is visible, one click starts a night.
  await loginAsHost(hostPage, seed.hostEmail);
  await hostPage.goto("/dashboard");
  const card = hostPage
    .getByTestId("pack-card")
    .filter({ hasText: "Opening Night: General Knowledge" });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole("button", { name: /start tonight's game/i }).click();
  await hostPage.waitForURL(/\/host\//, { timeout: 30000 });
  const gameId = hostPage.url().split("/host/")[1];

  await expect(hostPage.getByTestId("join-code")).toBeVisible({ timeout: 15000 });
  const joinCode = (await hostPage.getByTestId("join-code").textContent())!.trim();
  expect(joinCode).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);

  // Dashboard-created games run the auto-host by default (the product bet).
  // Pause it while still in the lobby (no dwell there) so the scripted part
  // of this test stays deterministic; we resume it later to prove the engine.
  await hostPage.keyboard.press("p");
  await expect(hostPage.getByTestId("auto-status")).toHaveAttribute("data-paused", "true");

  // Two phones, two teams.
  const p1 = await newPlayer(browser, joinCode);
  await joinNewTeam(p1, "Norm", "Baseline");
  const p2 = await newPlayer(browser, joinCode);
  await joinNewTeam(p2, "Cliff", "Controls");

  // Play the library's first question for real.
  await advanceTo(hostPage, "round_intro");
  await advanceTo(hostPage, "question");
  await expect(hostPage.getByTestId("question-prompt")).toContainText("Guacamole");
  await p1.getByTestId("option-1").click(); // Avocado — correct
  await expect(p1.getByTestId("answer-locked")).toBeVisible({ timeout: 10000 });
  await p2.getByTestId("option-0").click(); // Tomatillo — wrong
  await expect(p2.getByTestId("answer-locked")).toBeVisible({ timeout: 10000 });

  await advanceTo(hostPage, "locked");
  await advanceTo(hostPage, "reveal");
  await expect(hostPage.getByTestId("reveal-answer")).toContainText("Avocado");
  await expect(p1.getByTestId("reveal-verdict")).toContainText("Correct", {
    timeout: 15000,
  });
  await expect(p2.getByTestId("reveal-verdict")).toContainText("Wrong");
  await expect(hostPage.getByTestId("host-line")).toBeVisible();

  // Resume the auto-host: with no clicks at all, the reveal dwell should
  // carry the night to the next question by itself (M3's core bet).
  await hostPage.keyboard.press("p");
  await expect(hostPage.getByTestId("auto-status")).toHaveAttribute("data-paused", "false");
  await expect(hostPage.getByTestId("console-state")).toHaveAttribute("data-state", "question", {
    timeout: 20000,
  });

  // All-answered skip: both teams answer Q2 and the console cuts to the lock
  // on its own — no clicks, long before the 30s deadline.
  await expect(p1.getByTestId("answer-form")).toBeVisible({ timeout: 15000 });
  await p1.getByTestId("option-3").click(); // Toto — correct
  await expect(p1.getByTestId("answer-locked")).toBeVisible({ timeout: 10000 });
  await expect(p2.getByTestId("answer-form")).toBeVisible({ timeout: 15000 });
  await p2.getByTestId("option-0").click();
  await expect(p2.getByTestId("answer-locked")).toBeVisible({ timeout: 10000 });
  await expect(hostPage.getByTestId("console-state")).toHaveAttribute("data-state", "locked", {
    timeout: 8000,
  });

  // The creation flow emitted its frozen event.
  const admin = adminClient();
  const { data: created } = await admin
    .from("analytics_events")
    .select("id")
    .eq("game_id", gameId)
    .eq("event", "game_created");
  expect(created).toHaveLength(1);
});
