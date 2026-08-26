// M4 gate (PRD §10): the save moment round-trips — post-game stats show, the
// magic link creates an account, game_players links to it, and the
// created_from_game attribution + frozen events are exactly right.
import { expect, test } from "@playwright/test";
import { adminClient } from "./helpers/admin";
import { seedSyntheticNight } from "./helpers/fixtures";
import { hostAccessToken } from "./helpers/auth";
import { advanceUntil } from "./helpers/drive";
import { latestEmailLink } from "./helpers/mailpit";
import { advanceGame, getGameState } from "../src/lib/game/api";
import { join, newPlayer } from "./helpers/players";

test("the save moment: stats → magic link → account with attribution", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const night = await seedSyntheticNight();
  const token = await hostAccessToken(night.hostEmail);
  const saveEmail = `save-${night.suffix}@example.com`;

  // One phone joins and answers the first question correctly.
  const p1 = await newPlayer(browser, night.joinCode);
  await join(p1, "Sam");

  await advanceGame({ gameId: night.gameId, expectedState: "lobby", accessToken: token });
  await advanceGame({ gameId: night.gameId, expectedState: "round_intro", accessToken: token });
  await expect(p1.getByTestId("answer-form")).toBeVisible({ timeout: 15000 });
  await p1.getByTestId("option-1").click(); // Mars — correct
  await expect(p1.getByTestId("answer-locked")).toBeVisible({ timeout: 10000 });

  // Fast-forward the rest of the night over the API.
  await advanceUntil(night.gameId, token, "ended");
  const finalState = await getGameState({ gameId: night.gameId });
  expect(finalState.state).toBe("ended");

  // The phone lands on personal stats.
  await expect(p1.getByTestId("personal-stats")).toBeVisible({ timeout: 20000 });
  await expect(p1.getByTestId("final-standing")).toContainText("#1 of 1");
  await expect(p1.getByTestId("personal-stats")).toContainText("1"); // answered/correct

  // Save: email in, magic link out.
  await p1.getByTestId("save-email").fill(saveEmail);
  await p1.getByRole("button", { name: /save my stats/i }).click();
  await expect(p1.getByTestId("save-link-sent")).toBeVisible({ timeout: 15000 });

  const link = await latestEmailLink(saveEmail);
  expect(link).toContain("/auth/confirm");
  await p1.goto(link);
  await p1.waitForURL(/\/save\/complete/, { timeout: 20000 });
  await expect(p1.getByTestId("save-complete")).toContainText("Account created", {
    timeout: 15000,
  });

  // /me shows the night.
  await p1.getByRole("link", { name: /see my stats/i }).click();
  await p1.waitForURL(/\/me/);
  await expect(p1.getByTestId("me-name")).toHaveText("Sam");
  await expect(p1.getByTestId("me-totals")).toContainText("1");
  await expect(p1.getByTestId("me-games")).toContainText("Synthetic Night");

  // ---- DB audit: attribution + linkage + frozen events ----
  const admin = adminClient();
  const { data: authUser } = await admin
    .from("game_players")
    .select("profile_id, profiles(display_name, created_from_game)")
    .eq("game_id", night.gameId)
    .not("profile_id", "is", null)
    .single();
  expect(authUser!.profile_id).toBeTruthy();
  const profile = authUser!.profiles as unknown as {
    display_name: string;
    created_from_game: string;
  };
  expect(profile.display_name).toBe("Sam");
  expect(profile.created_from_game).toBe(night.gameId); // the attribution row

  const { data: events } = await admin
    .from("analytics_events")
    .select("event")
    .eq("game_id", night.gameId)
    .in("event", ["account_save_prompted", "account_created_from_game"]);
  const count = (name: string) => events!.filter((e) => e.event === name).length;
  expect(count("account_save_prompted")).toBe(1); // deduped despite re-renders
  expect(count("account_created_from_game")).toBe(1);

  // Re-clicking the link re-confirms without duplicating anything.
  await p1.goto(link); // token already used → login error page is acceptable
  const { data: eventsAfter } = await admin
    .from("analytics_events")
    .select("event")
    .eq("game_id", night.gameId)
    .eq("event", "account_created_from_game");
  expect(eventsAfter).toHaveLength(1);
});
