import { expect, test } from "@playwright/test";

test("landing page shows the pitch and the venue CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Trivia Bot" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /run trivia at your bar/i }),
  ).toBeVisible();
});
