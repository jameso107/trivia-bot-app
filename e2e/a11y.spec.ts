// Accessibility pass (PRD §10 M7): automated axe scans on the public
// surfaces. Serious/critical violations fail the build; the console's
// from-25-feet legibility is covered by §6's type floors.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seedSyntheticNight } from "./helpers/fixtures";

async function scan(page: import("@playwright/test").Page, name: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const blockers = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(
    blockers,
    `${name}: ${blockers.map((b) => `${b.id} (${b.impact}) on ${b.nodes.length} nodes`).join("; ")}`,
  ).toEqual([]);
}

test("landing, login, and the join form pass axe (serious+critical)", async ({ page }) => {
  test.setTimeout(180_000);
  const night = await seedSyntheticNight();

  await page.goto("/");
  await scan(page, "landing");

  await page.goto("/login");
  await scan(page, "login");

  await page.goto(`/j/${night.joinCode}`);
  await expect(page.getByTestId("join-form")).toBeVisible({ timeout: 15000 });
  await scan(page, "join form");
});
