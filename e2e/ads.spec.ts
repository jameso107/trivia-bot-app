// M6 gate slice (PRD §7/§9): creatives render on both surfaces, the sponsor
// slot honors venue opt-in and creative priority, the venue-health trigger
// fires on game end, and every ad_impression lands with correct props.
import { expect, test } from "@playwright/test";
import { adminClient } from "./helpers/admin";
import { seedSyntheticNight } from "./helpers/fixtures";
import { hostAccessToken, loginAsHost } from "./helpers/auth";
import { advanceUntil } from "./helpers/drive";
import { joinNewTeam, newPlayer } from "./helpers/players";

test("ad slots: sponsor screen creative, house phone card, impressions, venue health", async ({
  browser,
  page: hostPage,
}) => {
  test.setTimeout(240_000);
  const night = await seedSyntheticNight();
  const admin = adminClient();
  const token = await hostAccessToken(night.hostEmail);

  // Venue opts into the sponsor slot; its own venue_promo outranks house
  // (v1 surfaces house/venue_promo per PRD §7 — sponsor kind arrives with
  // ad-sales). venue_promo is venue-scoped, which also isolates test runs.
  await admin
    .from("games")
    .update({ settings: { speed_bonus: true, auto_host: false, sponsor_slot: true } })
    .eq("id", night.gameId);
  const { data: sponsorCreative } = await admin
    .from("ad_creatives")
    .insert({
      kind: "venue_promo",
      venue_id: night.venueId,
      surface: "screen",
      headline: `Test Sponsor ${night.suffix}`,
      body: "Proudly confusing trivia teams since tonight.",
    })
    .select("id")
    .single();

  await loginAsHost(hostPage, night.hostEmail);
  await hostPage.goto(`/host/${night.gameId}`);
  await expect(hostPage.getByTestId("join-code")).toBeVisible({ timeout: 15000 });

  const p1 = await newPlayer(browser, night.joinCode);
  await joinNewTeam(p1, "Watcher", "Ad Audience");

  // Round 1 (2 questions) → scores → intermission, driven over the API.
  await advanceUntil(night.gameId, token, "intermission");

  // Console: sponsor panel in intermission with the SPONSOR creative.
  await expect(hostPage.getByTestId("sponsor-panel")).toContainText(
    `Test Sponsor ${night.suffix}`,
    { timeout: 15000 },
  );
  // Phone: the house card between rounds.
  await expect(p1.getByTestId("phone-ad")).toContainText("Bring Trivia Bot to your bar", {
    timeout: 15000,
  });

  // Next round intro carries the strap.
  await advanceUntil(night.gameId, token, "round_intro");
  await expect(hostPage.getByTestId("sponsor-strap")).toContainText(
    `Test Sponsor ${night.suffix}`,
    { timeout: 15000 },
  );

  // Finish the night; the venue-health trigger fires on ended.
  await advanceUntil(night.gameId, token, "ended");

  // ---- impressions with correct props (frozen §8) ----
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("analytics_events")
          .select("props")
          .eq("game_id", night.gameId)
          .eq("event", "ad_impression");
        const rows = (data ?? []).map((e) => e.props as Record<string, unknown>);
        return {
          // exactly one screen impression (the single intermission), correct creative
          screenOk:
            rows.filter((p) => p.surface === "screen").length === 1 &&
            rows.some(
              (p) => p.surface === "screen" && p.creative_id === sponsorCreative!.id,
            ),
          // the phone card logs once per between-rounds break (≥1 across the night)
          phoneOk: rows.some((p) => p.surface === "phone"),
        };
      },
      { timeout: 15000 },
    )
    .toEqual({ screenOk: true, phoneOk: true });

  // ---- venue health (PRD §4 note / §9 venue-success contract) ----
  const { data: venue } = await admin
    .from("venues")
    .select("last_night, nights_run, first_night")
    .eq("id", night.venueId)
    .single();
  expect(venue!.nights_run).toBe(1);
  expect(venue!.last_night).toBeTruthy();
  expect(venue!.first_night).toBe(venue!.last_night);
});
