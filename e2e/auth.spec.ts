import { expect, test } from "@playwright/test";

test("login page renders the magic-link form", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: /run trivia at your bar/i }),
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /email me a sign-in link/i }),
  ).toBeVisible();
});

test("dashboard redirects signed-out visitors to login", async ({ page }) => {
  await page.goto("/dashboard");
  await page.waitForURL(/\/login/);
  await expect(
    page.getByRole("heading", { name: /run trivia at your bar/i }),
  ).toBeVisible();
});
