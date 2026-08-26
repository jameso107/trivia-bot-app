// M5 gate (PRD §7): a brand-new venue goes signup → first live game in under
// 10 minutes without help — wizard (which wakes the org daemon via the §9
// events row), settings, custom pack request, feedback, promo kit, the /v/
// flyer redirect, and a player joining off the flyer path (solo play).
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { adminClient } from "./helpers/admin";
import { hostAccessToken } from "./helpers/auth";
import { latestEmailLink } from "./helpers/mailpit";
import { advanceGame } from "../src/lib/game/api";

test("signup → first live game, with every M5 surface exercised", async ({ page }) => {
  test.setTimeout(300_000);
  const startedAt = Date.now();
  const suffix = randomUUID().slice(0, 8);
  const email = `owner-${suffix}@example.com`;
  const venueName = `E2E Brewpub ${suffix}`;
  const expectedSlug = `e2e-brewpub-${suffix}`;

  // ---- 1. cold signup via magic link ----
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /email me a sign-in link/i }).click();
  await expect(page.getByTestId("magic-link-sent")).toBeVisible({ timeout: 15000 });
  await page.goto(await latestEmailLink(email));
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });

  // ---- 2. first-run wizard ----
  await expect(page.getByTestId("first-run-wizard")).toBeVisible();
  await page.locator('input[name="name"]').fill(venueName);
  await page.locator('input[name="metro"]').fill("Detroit");
  await expect(page.locator('input[name="slug"]')).toHaveValue(expectedSlug);
  await page.getByRole("button", { name: /create my venue/i }).click();
  await expect(page.getByTestId("venue-name")).toHaveText(venueName, { timeout: 20000 });

  // ---- 3. settings: flip the soundtrack on, save ----
  await page.locator('input[name="music_enabled"]').check();
  await page.getByRole("button", { name: /save defaults/i }).click();
  await expect(page.getByTestId("notice")).toContainText("Settings saved", {
    timeout: 15000,
  });

  // ---- 4. custom pack request (comped premium) ----
  await page.locator('input[name="topic"]').fill("'90s Detroit sports");
  await page.getByRole("button", { name: /request pack/i }).click();
  await expect(page.getByTestId("notice")).toContainText("Custom pack requested", {
    timeout: 15000,
  });
  await expect(page.getByTestId("request-list")).toContainText("'90s Detroit sports");
  await expect(page.getByTestId("request-list")).toContainText("requested");

  // ---- 5. venue feedback ----
  await page.locator('textarea[name="body"]').fill("The host is funnier than our old one.");
  await page.getByRole("button", { name: /send feedback/i }).click();
  await expect(page.getByTestId("notice")).toContainText("Feedback sent", { timeout: 15000 });

  // ---- 6. start the first night from the library ----
  const card = page
    .getByTestId("pack-card")
    .filter({ hasText: "Opening Night: General Knowledge" });
  await card.getByRole("button", { name: /start tonight's game/i }).click();
  await page.waitForURL(/\/host\//, { timeout: 30000 });
  const gameId = page.url().split("/host/")[1];
  await expect(page.getByTestId("join-code")).toBeVisible({ timeout: 15000 });
  await page.keyboard.press("p"); // freeze the auto-host; scripted from here

  const elapsedMs = Date.now() - startedAt;
  expect(elapsedMs).toBeLessThan(600_000); // the PRD's 10-minute bar

  // ---- 7. promo kit + the /v/ flyer redirect ----
  const p2 = await page.context().newPage();
  await p2.goto("/dashboard/promo");
  await expect(p2.getByTestId("flyer")).toContainText(venueName);
  await p2.getByTestId("print-flyer").click(); // headless print is a no-op; the event isn't
  await expect(p2.getByTestId("print-flyer")).toHaveAttribute("data-logged", "true", {
    timeout: 15000,
  });
  await p2.goto(`/v/${expectedSlug}`);
  await p2.waitForURL(/\/j\//, { timeout: 20000 }); // flyer QR → live game
  await expect(p2.getByTestId("join-form")).toBeVisible({ timeout: 15000 });

  // ---- 8. a player joins off the flyer path and sees the night through ----
  await p2.locator('input[name="displayName"]').fill("Skeptic");
  await p2.getByRole("button", { name: /let's play/i }).click();
  await expect(p2.getByTestId("player-screen")).toBeVisible({ timeout: 15000 });

  const token = await hostAccessToken(email);
  await advanceGame({ gameId, expectedState: "lobby", accessToken: token });
  await advanceGame({ gameId, expectedState: "round_intro", accessToken: token });
  await advanceGame({ gameId, expectedState: "question", accessToken: token });
  await advanceGame({ gameId, expectedState: "locked", accessToken: token });
  await expect(p2.getByTestId("reveal-card")).toBeVisible({ timeout: 15000 });
  await expect(p2.getByTestId("my-place")).toBeVisible(); // placement chip between questions

  // ---- 9. DB audit: the org wake-up + every frozen event fired ----
  const admin = adminClient();
  const { data: venue } = await admin
    .from("venues")
    .select("id, name, metro, slug")
    .eq("slug", expectedSlug)
    .single();
  expect(venue!.name).toBe(venueName);

  const { data: orgEvent } = await admin
    .from("events")
    .select("kind, payload")
    .eq("kind", "venue_signup")
    .eq("payload->>venue_id", venue!.id);
  expect(orgEvent).toHaveLength(1); // the daemon's CX wake-up row (PRD §9)

  const { data: game } = await admin
    .from("games")
    .select("settings")
    .eq("id", gameId)
    .single();
  expect((game!.settings as Record<string, unknown>).music_enabled).toBe(true); // defaults rode in

  const { data: events } = await admin
    .from("analytics_events")
    .select("event")
    .eq("venue_id", venue!.id);
  const count = (name: string) => events!.filter((e) => e.event === name).length;
  expect(count("venue_signup_completed")).toBe(1);
  expect(count("custom_pack_requested")).toBe(1);
  expect(count("feedback_submitted")).toBe(1);
  expect(count("promo_kit_downloaded")).toBeGreaterThanOrEqual(1);
  expect(count("game_created")).toBe(1);
});
