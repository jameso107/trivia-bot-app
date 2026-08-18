// Shared browser choreography for game E2E: phones joining, the host console
// advancing, per-surface state assertions.
import { expect, type Browser, type Page } from "@playwright/test";

export async function newPlayer(browser: Browser, code: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/j/${code}`);
  await expect(page.getByTestId("join-form")).toBeVisible({ timeout: 15000 });
  return page;
}

export async function joinNewTeam(page: Page, name: string, team: string) {
  await page.locator('input[name="displayName"]').fill(name);
  await page.locator('select[name="team"]').selectOption("__new__");
  await page.locator('input[name="teamName"]').fill(team);
  await page.getByRole("button", { name: /let's play/i }).click();
  await expect(page.getByTestId("player-screen")).toBeVisible({ timeout: 15000 });
}

export async function joinExistingTeam(page: Page, name: string, team: string) {
  const option = page.locator('select[name="team"] option', { hasText: team });
  await expect(option).toHaveCount(1, { timeout: 15000 });
  const value = await option.getAttribute("value");
  await page.locator('input[name="displayName"]').fill(name);
  await page.locator('select[name="team"]').selectOption(value!);
  await page.getByRole("button", { name: /let's play/i }).click();
  await expect(page.getByTestId("player-screen")).toBeVisible({ timeout: 15000 });
}

export async function advanceTo(host: Page, state: string) {
  await host.getByTestId("advance-button").click();
  await expect(host.getByTestId("console-state")).toHaveAttribute("data-state", state, {
    timeout: 15000,
  });
}

export async function expectPlayerState(page: Page, state: string) {
  await expect(page.getByTestId("player-screen")).toHaveAttribute("data-state", state, {
    timeout: 15000,
  });
}
