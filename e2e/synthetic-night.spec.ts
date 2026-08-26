// ============================================================================
// THE SYNTHETIC NIGHT (PRD §7) — the deploy gate. 8 phones playing solo (each
// player is a team-of-one under the hood), 2 rounds + a final wager, one
// mid-round reconnect. At the end, every stored score is recomputed through
// the SAME pure scoring function the engine used and must match exactly, the
// podium must agree, and the frozen §8 analytics taxonomy must have fired.
// ============================================================================
import { expect, test } from "@playwright/test";
import { adminClient } from "./helpers/admin";
import { seedSyntheticNight, type SyntheticNight } from "./helpers/fixtures";
import { loginAsHost } from "./helpers/auth";
import { advanceTo, expectPlayerState, join, newPlayer } from "./helpers/players";
import {
  scoreQuestion,
  type ScoringAnswer,
} from "../supabase/functions/_shared/scoring.ts";
import { rankStandings } from "../supabase/functions/_shared/protocol.ts";

test.describe.configure({ mode: "serial" });

test("the synthetic night: 8 solo players, 2 rounds + final, exact scores", async ({
  browser,
  page: hostPage,
}) => {
  test.setTimeout(300_000);

  const night: SyntheticNight = await seedSyntheticNight();
  const [q1, q2, q3, q4] = night.questions;

  // ---- host console up ----
  await loginAsHost(hostPage, night.hostEmail);
  await hostPage.goto(`/host/${night.gameId}`);
  await expect(hostPage.getByTestId("join-code")).toHaveText(night.joinCode, {
    timeout: 15000,
  });

  // ---- 8 phones join, every player flying solo ----
  const p1 = await newPlayer(browser, night.joinCode);
  await join(p1, "Ada");
  const p2 = await newPlayer(browser, night.joinCode);
  await join(p2, "Grace");
  const p3 = await newPlayer(browser, night.joinCode);
  await join(p3, "Alan");
  const p4 = await newPlayer(browser, night.joinCode);
  await join(p4, "Isaac");
  const p5 = await newPlayer(browser, night.joinCode);
  await join(p5, "Marie");
  const p6 = await newPlayer(browser, night.joinCode);
  await join(p6, "Rosalind");
  const p7 = await newPlayer(browser, night.joinCode);
  await join(p7, "Norm");
  const p8 = await newPlayer(browser, night.joinCode);
  await join(p8, "Cliff");

  await expect(hostPage.getByTestId("player-count")).toContainText("8 players", {
    timeout: 15000,
  });

  // ---- round 1 ----
  await advanceTo(hostPage, "round_intro");
  await advanceTo(hostPage, "question");
  await expect(hostPage.getByTestId("question-prompt")).toHaveText(q1.prompt);
  await expectPlayerState(p1, "question");

  // Q1 (multiple choice, correct = 1): Ada, Grace, Norm right; Isaac wrong;
  // four of eight answer at all.
  await p1.getByTestId("option-1").click();
  await expect(p1.getByTestId("answer-locked")).toBeVisible({ timeout: 10000 });
  await p2.getByTestId("option-1").click();
  await expect(p2.getByTestId("answer-locked")).toBeVisible({ timeout: 10000 });
  await p4.getByTestId("option-0").click();
  await expect(p4.getByTestId("answer-locked")).toBeVisible({ timeout: 10000 });
  await p7.getByTestId("option-1").click();
  await expect(p7.getByTestId("answer-locked")).toBeVisible({ timeout: 10000 });
  await expect(hostPage.getByTestId("answered-tick")).toContainText("4/8", {
    timeout: 10000,
  });

  await advanceTo(hostPage, "locked");
  await advanceTo(hostPage, "reveal");
  await expect(hostPage.getByTestId("reveal-answer")).toContainText("Mars");
  await expect(p1.getByTestId("reveal-verdict")).toContainText("Correct", {
    timeout: 15000,
  });
  await expect(p4.getByTestId("reveal-verdict")).toContainText("Wrong");

  // Q2 (true/false, correct = true): Grace and Marie answer, six sit out.
  await advanceTo(hostPage, "question");
  await expect(hostPage.getByTestId("question-prompt")).toHaveText(q2.prompt);
  await expectPlayerState(p2, "question");
  await p2.getByTestId("option-true").click();
  await expect(p2.getByTestId("answer-locked")).toBeVisible({ timeout: 10000 });
  await p5.getByTestId("option-true").click();
  await expect(p5.getByTestId("answer-locked")).toBeVisible({ timeout: 10000 });

  await advanceTo(hostPage, "locked");
  await advanceTo(hostPage, "reveal");
  await advanceTo(hostPage, "scores");
  await expect(hostPage.getByTestId("leaderboard")).toBeVisible();
  await advanceTo(hostPage, "intermission");

  // ---- round 2 ----
  await advanceTo(hostPage, "round_intro");
  await advanceTo(hostPage, "question");
  await expect(hostPage.getByTestId("question-prompt")).toHaveText(q3.prompt);

  // RECONNECT (PRD §3): Cliff's phone dies mid-round and comes back...
  await p8.reload();
  await expect(p8.getByTestId("player-screen")).toBeVisible({ timeout: 15000 });
  await expect(p8.getByTestId("join-form")).toHaveCount(0); // no re-join form
  await expectPlayerState(p8, "question");

  // Q3 (number closest, answer 1908): Rosalind exact, Alan 8 off, Cliff 108 off.
  await p3.getByTestId("number-input").fill("1900");
  await p3.getByRole("button", { name: /lock it in/i }).click();
  await expect(p3.getByTestId("answer-locked")).toBeVisible({ timeout: 10000 });
  await p6.getByTestId("number-input").fill("1908");
  await p6.getByRole("button", { name: /lock it in/i }).click();
  await expect(p6.getByTestId("answer-locked")).toBeVisible({ timeout: 10000 });
  // ...and the reconnected phone still answers.
  await p8.getByTestId("number-input").fill("1800");
  await p8.getByRole("button", { name: /lock it in/i }).click();
  await expect(p8.getByTestId("answer-locked")).toBeVisible({ timeout: 10000 });

  await advanceTo(hostPage, "locked");
  await advanceTo(hostPage, "reveal");

  // Q4 (open text, accepts "The Beatles"/"Beatles"): normalization at work.
  await advanceTo(hostPage, "question");
  await expect(hostPage.getByTestId("question-prompt")).toHaveText(q4.prompt);
  await expectPlayerState(p1, "question");
  await p1.getByTestId("text-input").fill("the beatles");
  await p1.getByRole("button", { name: /lock it in/i }).click();
  await expect(p1.getByTestId("answer-locked")).toBeVisible({ timeout: 10000 });
  await p4.getByTestId("text-input").fill("the beetles");
  await p4.getByRole("button", { name: /lock it in/i }).click();
  await expect(p4.getByTestId("answer-locked")).toBeVisible({ timeout: 10000 });
  await p7.getByTestId("text-input").fill("BEATLES!");
  await p7.getByRole("button", { name: /lock it in/i }).click();
  await expect(p7.getByTestId("answer-locked")).toBeVisible({ timeout: 10000 });

  await advanceTo(hostPage, "locked");
  await advanceTo(hostPage, "reveal");
  await advanceTo(hostPage, "scores");

  // ---- final wager (correct = 1, Michigan) ----
  await advanceTo(hostPage, "final_question");
  await expectPlayerState(p2, "final_question");

  await p2.getByTestId("wager-input").fill("80");
  await p2.getByTestId("option-1").click();
  await expect(p2.getByTestId("answer-locked")).toBeVisible({ timeout: 10000 });
  await p5.getByTestId("wager-input").fill("100");
  await p5.getByTestId("option-0").click();
  await expect(p5.getByTestId("answer-locked")).toBeVisible({ timeout: 10000 });
  await p7.getByTestId("wager-input").fill("0");
  await p7.getByTestId("option-1").click();
  await expect(p7.getByTestId("answer-locked")).toBeVisible({ timeout: 10000 });

  await advanceTo(hostPage, "locked");
  await advanceTo(hostPage, "reveal");
  await advanceTo(hostPage, "podium");

  // ---- audit: exact scoring parity with the pure function ----
  const admin = adminClient();
  const { data: answerRows } = await admin
    .from("answers")
    .select("id, question_id, team_id, payload, submitted_at, deadline_at, is_correct, points")
    .eq("game_id", night.gameId);
  const { data: teamRows } = await admin
    .from("game_teams")
    .select("id, name, score")
    .eq("game_id", night.gameId);
  expect(teamRows).toHaveLength(8); // one team-of-one per player
  expect(answerRows!.length).toBe(15); // Q1:4 + Q2:2 + Q3:3 + Q4:3 + final:3

  const expectedTotals = new Map<string, number>(teamRows!.map((t) => [t.id as string, 0]));
  for (const q of night.questions) {
    const qAnswers = answerRows!.filter((a) => a.question_id === q.id);
    if (qAnswers.length === 0) continue;
    const scoringAnswers: ScoringAnswer[] = qAnswers.map((a) => ({
      teamId: a.team_id as string,
      payload: a.payload,
      submittedAtMs: Date.parse(a.submitted_at as string),
    }));
    const deadlineMs = Date.parse(qAnswers[0].deadline_at as string);
    const expected = scoreQuestion(
      {
        format: q.format,
        answer: q.answer,
        timeLimitS: q.time_limit_s,
        deadlineMs,
        isFinal: q.round === 3,
      },
      scoringAnswers,
      { speedBonus: true },
    );
    for (const exp of expected) {
      const stored = qAnswers.find((a) => a.team_id === exp.teamId)!;
      expect.soft(stored.is_correct, `is_correct for ${q.prompt} / team ${exp.teamId}`).toBe(
        exp.isCorrect,
      );
      expect
        .soft(Number(stored.points), `points for ${q.prompt} / team ${exp.teamId}`)
        .toBe(exp.points);
      expectedTotals.set(exp.teamId, (expectedTotals.get(exp.teamId) ?? 0) + exp.points);
    }
  }
  for (const t of teamRows!) {
    expect(Number(t.score), `total for ${t.name}`).toBe(expectedTotals.get(t.id as string));
  }

  // Podium order on screen matches the recomputed ranking.
  const expectedOrder = rankStandings(
    teamRows!.map((t) => ({
      teamId: t.id as string,
      name: t.name as string,
      score: Number(t.score),
    })),
  ).map((t) => t.name);
  const shownOrder = await hostPage
    .locator('[data-testid="leaderboard"] li')
    .evaluateAll((lis) => lis.map((li) => li.getAttribute("data-team")));
  expect(shownOrder).toEqual(expectedOrder);
  // No literal-order assertion: with solo players the top spots hinge on
  // speed-bonus timing. Parity with the recomputed ranking IS the gate.

  // ---- the night ends ----
  await advanceTo(hostPage, "ended");
  await expect(hostPage.getByTestId("ended-screen")).toBeVisible();
  await expect(p1.getByTestId("player-ended")).toBeVisible({ timeout: 15000 });

  // ---- §8 taxonomy audit for this game ----
  const { data: events } = await admin
    .from("analytics_events")
    .select("event, props")
    .eq("game_id", night.gameId);
  const count = (name: string) => events!.filter((e) => e.event === name).length;
  expect(count("game_started")).toBe(1);
  expect(count("player_joined")).toBe(8);
  expect(count("team_created")).toBe(8); // a team-of-one per player
  expect(count("question_revealed")).toBe(5);
  expect(count("round_completed")).toBe(2);
  expect(count("answer_submitted")).toBe(answerRows!.length);
  expect(count("game_completed")).toBe(1);
  const completed = events!.find((e) => e.event === "game_completed")!.props as Record<
    string,
    number
  >;
  expect(completed.players).toBe(8);
  expect(completed.teams).toBe(8);
  expect(completed.questions_played).toBe(5);
  expect(completed.duration_s).toBeGreaterThanOrEqual(0);
});
