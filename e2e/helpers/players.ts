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

// Solo play (2026-08-26): a name is all it takes — the server mints a
// single-member team behind the scenes.
export async function join(page: Page, name: string) {
  await page.locator('input[name="displayName"]').fill(name);
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
