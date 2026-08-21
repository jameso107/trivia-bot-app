import { expect, test } from "@playwright/test";

test("landing page shows the pitch, CTA, and inbound form", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /trivia night\s+runs itself/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /run trivia at your bar/i }).first()).toBeVisible();
  await expect(page.getByTestId("inquiry-form")).toBeVisible();
  // Footer legal + city pages exist and render.
  for (const path of ["/privacy", "/terms", "/detroit"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});
