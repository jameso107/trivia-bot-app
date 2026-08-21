// Two features, one spec: the self-serve pack builder (write → publish →
// start a night → and NO other venue can see it) and the host's
// "Finish game & exit" (any in-flight state → podium as-is → stock ended).
import { expect, test, type Page } from "@playwright/test";
import { adminClient } from "./helpers/admin";
import { loginAsHost } from "./helpers/auth";
import { seedSyntheticNight, seedVenueHost } from "./helpers/fixtures";
import { advanceTo } from "./helpers/players";

async function fillQuestion(page: Page, i: number, prompt: string) {
  await page.getByTestId(`q-prompt-${i}`).fill(prompt);
  await page.getByTestId(`q-${i}-option-0`).fill("Right answer");
  await page.getByTestId(`q-${i}-option-1`).fill("Wrong answer");
}

test("a venue writes, publishes, and starts a night on its own pack — invisibly to other venues", async ({
  page,
  browser,
}) => {
  const host = await seedVenueHost();
  await loginAsHost(page, host.hostEmail);

  await page.goto("/dashboard");
  await page.getByTestId("create-pack-cta").click();

  const packTitle = `House Pack ${host.suffix}`;
  await page.getByTestId("pack-title").fill(packTitle);
  await fillQuestion(page, 0, "What's the name of the dog that sleeps by our door?");
  for (let i = 1; i < 5; i++) {
    await page.getByTestId("add-question").click();
    await fillQuestion(page, i, `House question number ${i + 1}, written at the bar?`);
  }

  await page.getByTestId("publish-pack").click();
  await expect(page.getByTestId("notice")).toContainText("Your pack is live", { timeout: 15_000 });

  // It's in "Your packs" as live…
  const card = page.getByTestId("own-pack-card").filter({ hasText: packTitle });
  await expect(card).toBeVisible();
  await expect(card).toContainText("live");

  // …the engine accepts it as a real night…
  await card.getByRole("button", { name: /start tonight/i }).click();
  await expect(page).toHaveURL(/\/host\//, { timeout: 15_000 });
  await expect(page.getByText(/code [A-Z2-9]{4}/i)).toBeVisible({ timeout: 15_000 });

  // …and a DIFFERENT venue can't see it (RLS scoping).
  const rival = await seedVenueHost();
  const rivalCtx = await browser.newContext();
  const rivalPage = await rivalCtx.newPage();
  await loginAsHost(rivalPage, rival.hostEmail);
  await rivalPage.goto("/dashboard");
  await expect(rivalPage.getByTestId("pack-library")).toBeVisible();
  await expect(rivalPage.getByText(packTitle)).toHaveCount(0);
  await rivalCtx.close();
});

test("finish game & exit ends the night as it stands", async ({ page }) => {
  const night = await seedSyntheticNight();
  await loginAsHost(page, night.hostEmail);
  await page.goto(`/host/${night.gameId}`);

  // Drive into the middle of the night: lobby → round_intro → question 1.
  await expect(page.getByTestId("advance-button")).toBeVisible({ timeout: 15_000 });
  await advanceTo(page, "round_intro");
  await advanceTo(page, "question");
  await expect(page.getByText(night.questions[0].prompt)).toBeVisible({ timeout: 15_000 });

  // Two-press confirm, mid-question.
  await page.getByTestId("finish-game-button").click();
  await expect(page.getByTestId("finish-game-button")).toContainText("Press again");
  await page.getByTestId("finish-game-button").click();

  // The game lands on the podium with scores as they stand…
  await expect
    .poll(
      async () => {
        const { data } = await adminClient()
          .from("games")
          .select("state")
          .eq("id", night.gameId)
          .single();
        return data?.state;
      },
      { timeout: 15_000 },
    )
    .toBe("podium");

  // …and the stock podium → ended path completes the night.
  await page.getByTestId("advance-button").click();
  await expect(page.getByRole("link", { name: /back to dashboard/i })).toBeVisible({
    timeout: 15_000,
  });
  const { data: done } = await adminClient()
    .from("games")
    .select("state, ended_at")
    .eq("id", night.gameId)
    .single();
  expect(done?.state).toBe("ended");
  expect(done?.ended_at).toBeTruthy();
});
