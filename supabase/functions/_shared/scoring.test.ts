import { describe, expect, it } from "vitest";
import {
  clampWager,
  isAnswerCorrect,
  scoreQuestion,
  speedBonus,
  type ScoringAnswer,
  type ScoringQuestion,
} from "./scoring.ts";

const DEADLINE = 1_000_000_000_000; // arbitrary epoch ms
const ON = { speedBonus: true };
const OFF = { speedBonus: false };

function q(partial: Partial<ScoringQuestion>): ScoringQuestion {
  return {
    format: "multiple_choice",
    answer: 2,
    timeLimitS: 30,
    deadlineMs: DEADLINE,
    isFinal: false,
    ...partial,
  };
}

function ans(teamId: string, payload: unknown, secondsBeforeDeadline = 10): ScoringAnswer {
  return { teamId, payload, submittedAtMs: DEADLINE - secondsBeforeDeadline * 1000 };
}

describe("speedBonus", () => {
  it("is round(50 × remaining/limit)", () => {
    expect(speedBonus(30, DEADLINE, DEADLINE - 30_000)).toBe(50); // full time left
    expect(speedBonus(30, DEADLINE, DEADLINE - 15_000)).toBe(25);
    expect(speedBonus(30, DEADLINE, DEADLINE)).toBe(0); // at the buzzer
    expect(speedBonus(30, DEADLINE, DEADLINE - 10_000)).toBe(17); // 50*(1/3) → 16.67 → 17
  });

  it("clamps outside the window", () => {
    expect(speedBonus(30, DEADLINE, DEADLINE + 5_000)).toBe(0); // late (defensive)
    expect(speedBonus(30, DEADLINE, DEADLINE - 60_000)).toBe(50); // impossibly early
    expect(speedBonus(0, DEADLINE, DEADLINE)).toBe(0); // degenerate limit
  });
});

describe("isAnswerCorrect", () => {
  it("multiple_choice matches the canonical index", () => {
    expect(isAnswerCorrect("multiple_choice", 2, { choice: 2 })).toBe(true);
    expect(isAnswerCorrect("multiple_choice", 2, { choice: 1 })).toBe(false);
    expect(isAnswerCorrect("multiple_choice", 2, { choice: "2" })).toBe(false);
    expect(isAnswerCorrect("multiple_choice", 2, {})).toBe(false);
    expect(isAnswerCorrect("multiple_choice", 2, null)).toBe(false);
  });

  it("true_false matches booleans strictly", () => {
    expect(isAnswerCorrect("true_false", true, { choice: true })).toBe(true);
    expect(isAnswerCorrect("true_false", true, { choice: false })).toBe(false);
    expect(isAnswerCorrect("true_false", false, { choice: false })).toBe(true);
    expect(isAnswerCorrect("true_false", true, { choice: "true" })).toBe(false);
  });

  it("open_text normalizes case, spacing, punctuation, diacritics", () => {
    const canonical = { accept: ["The Beatles", "Beatles"] };
    expect(isAnswerCorrect("open_text", canonical, { text: "the beatles" })).toBe(true);
    expect(isAnswerCorrect("open_text", canonical, { text: "  BEATLES!! " })).toBe(true);
    expect(isAnswerCorrect("open_text", canonical, { text: "Béatles" })).toBe(true);
    expect(isAnswerCorrect("open_text", canonical, { text: "the beetles" })).toBe(false);
    expect(isAnswerCorrect("open_text", canonical, { text: "" })).toBe(false);
    expect(isAnswerCorrect("open_text", canonical, {})).toBe(false);
  });

  it("number_closest exact-hit only counts as correct", () => {
    expect(isAnswerCorrect("number_closest", 1969, { value: 1969 })).toBe(true);
    expect(isAnswerCorrect("number_closest", 1969, { value: 1970 })).toBe(false);
  });
});

describe("scoreQuestion — standard formats", () => {
  it("awards base 100 plus speed bonus when enabled", () => {
    const scores = scoreQuestion(
      q({}),
      [ans("t1", { choice: 2 }, 30), ans("t2", { choice: 2 }, 0), ans("t3", { choice: 0 }, 30)],
      ON,
    );
    expect(scores).toEqual([
      { teamId: "t1", isCorrect: true, points: 150 },
      { teamId: "t2", isCorrect: true, points: 100 },
      { teamId: "t3", isCorrect: false, points: 0 },
    ]);
  });

  it("awards flat 100 with speed bonus disabled", () => {
    const scores = scoreQuestion(q({}), [ans("t1", { choice: 2 }, 30)], OFF);
    expect(scores).toEqual([{ teamId: "t1", isCorrect: true, points: 100 }]);
  });

  it("handles zero answers", () => {
    expect(scoreQuestion(q({}), [], ON)).toEqual([]);
  });
});

describe("scoreQuestion — number_closest", () => {
  const question = q({ format: "number_closest", answer: 100 });

  it("gives 100 to nearest and 50 to second-nearest", () => {
    const scores = scoreQuestion(
      question,
      [ans("t1", { value: 90 }), ans("t2", { value: 120 }), ans("t3", { value: 500 })],
      ON,
    );
    expect(scores).toEqual([
      { teamId: "t1", isCorrect: false, points: 100 },
      { teamId: "t2", isCorrect: false, points: 50 },
      { teamId: "t3", isCorrect: false, points: 0 },
    ]);
  });

  it("ties at the same distance share the tier", () => {
    const scores = scoreQuestion(
      question,
      [ans("t1", { value: 90 }), ans("t2", { value: 110 }), ans("t3", { value: 130 })],
      ON,
    );
    expect(scores).toEqual([
      { teamId: "t1", isCorrect: false, points: 100 },
      { teamId: "t2", isCorrect: false, points: 100 },
      { teamId: "t3", isCorrect: false, points: 50 },
    ]);
  });

  it("ignores speed bonus and malformed values", () => {
    const scores = scoreQuestion(
      question,
      [ans("t1", { value: 100 }, 30), ans("t2", { value: "100" }), ans("t3", {})],
      ON,
    );
    expect(scores).toEqual([
      { teamId: "t1", isCorrect: true, points: 100 },
      { teamId: "t2", isCorrect: false, points: 0 },
      { teamId: "t3", isCorrect: false, points: 0 },
    ]);
  });
});

describe("scoreQuestion — final wager", () => {
  const finalQ = q({ isFinal: true, answer: 1 });

  it("adds the wager when correct, subtracts when wrong", () => {
    const scores = scoreQuestion(
      finalQ,
      [
        ans("t1", { choice: 1, wager: 80 }),
        ans("t2", { choice: 0, wager: 100 }),
        ans("t3", { choice: 1, wager: 0 }),
      ],
      ON,
    );
    expect(scores).toEqual([
      { teamId: "t1", isCorrect: true, points: 80 },
      { teamId: "t2", isCorrect: false, points: -100 },
      { teamId: "t3", isCorrect: true, points: 0 },
    ]);
  });

  it("clamps wagers to 0..100 and treats missing wagers as 0", () => {
    expect(clampWager(250)).toBe(100);
    expect(clampWager(-5)).toBe(0);
    expect(clampWager(33.9)).toBe(33);
    expect(clampWager("50")).toBe(0);
    expect(clampWager(undefined)).toBe(0);
    const scores = scoreQuestion(
      finalQ,
      [ans("t1", { choice: 1, wager: 9999 }), ans("t2", { choice: 0 })],
      ON,
    );
    expect(scores).toEqual([
      { teamId: "t1", isCorrect: true, points: 100 },
      { teamId: "t2", isCorrect: false, points: -0 },
    ]);
  });

  it("never applies base or speed bonus on the final", () => {
    const scores = scoreQuestion(finalQ, [ans("t1", { choice: 1, wager: 10 }, 30)], ON);
    expect(scores).toEqual([{ teamId: "t1", isCorrect: true, points: 10 }]);
  });
});
