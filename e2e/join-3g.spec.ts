// The PRD's headline budget (§3): player join → answering in <10s on a
// throttled 3G profile. Chromium CDP throttling approximates "regular 3G"
// (750kbps down, 150ms RTT) — hostile-bar-wifi territory.
//
// The clock covers the PLAYER's path only (page load → joined → answer
// tappable → answer accepted); the question is already open when they scan.
// The 10s budget is enforced against the production build (CI); local dev
// bundles are unminified and would measure the dev server, not the product.
import { expect, test } from "@playwright/test";
import { seedSyntheticNight } from "./helpers/fixtures";
import { hostAccessToken } from "./helpers/auth";
import { advanceGame } from "../src/lib/game/api";

test("3G join budget: QR scan → answering in under 10 seconds", async ({ browser }) => {
  test.setTimeout(180_000);
  const night = await seedSyntheticNight();
  const token = await hostAccessToken(night.hostEmail);

  // The night is already mid-question when this player scans the QR.
  await advanceGame({ gameId: night.gameId, expectedState: "lobby", accessToken: token });
  await advanceGame({ gameId: night.gameId, expectedState: "round_intro", accessToken: token });

  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (750 * 1024) / 8,
    uploadThroughput: (250 * 1024) / 8,
  });

  const t0 = Date.now();
  await page.goto(`/j/${night.joinCode}`);
  await expect(page.getByTestId("join-form")).toBeVisible({ timeout: 25000 });
  await page.locator('input[name="displayName"]').fill("Throttled Tim");
  await page.locator('select[name="team"]').selectOption("__new__");
  await page.locator('input[name="teamName"]').fill("Buffering");
  await page.getByRole("button", { name: /let's play/i }).click();
  await expect(page.getByTestId("answer-form")).toBeVisible({ timeout: 25000 });
  await page.getByTestId("option-1").click();
  await expect(page.getByTestId("answer-locked")).toBeVisible({ timeout: 25000 });
  const elapsedMs = Date.now() - t0;

  console.log(`3G join→answered in ${elapsedMs}ms (${process.env.CI ? "prod build, 10s budget" : "dev server, informational"})`);
  expect(elapsedMs).toBeLessThan(process.env.CI ? 10_000 : 45_000);
});
