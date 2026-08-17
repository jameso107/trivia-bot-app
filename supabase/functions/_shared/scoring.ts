// ============================================================================
// Scoring — the ONE pure function (PRD §5). The reveal transition scores with
// it, unit tests fixture it, and the synthetic-night E2E recomputes expected
// scores from recorded answers through this very module. No imports, no I/O.
//
// Canonical answer / payload shapes by format:
//   multiple_choice : answer = number (index into options)   payload = {choice: number}
//   true_false      : answer = boolean                       payload = {choice: boolean}
//   number_closest  : answer = number                        payload = {value: number}
//   open_text       : answer = {accept: string[]}            payload = {text: string}
//   final wager (any format): payload additionally carries {wager: number 0..100}
// ============================================================================

import type { QuestionFormat } from "./protocol.ts";

export const BASE_POINTS = 100;
export const MAX_SPEED_BONUS = 50;
export const CLOSEST_POINTS = 100;
export const SECOND_CLOSEST_POINTS = 50;
export const MAX_WAGER = 100;

export interface ScoringQuestion {
  format: QuestionFormat;
  answer: unknown; // canonical, from pack_questions.answer
  timeLimitS: number;
  deadlineMs: number; // epoch ms of the question deadline
  isFinal: boolean; // wager question: points = ±wager, no base/bonus
}

export interface ScoringAnswer {
  teamId: string;
  payload: unknown; // answers.payload as submitted
  submittedAtMs: number; // epoch ms, server clock
}

export interface TeamScore {
  teamId: string;
  isCorrect: boolean;
  points: number;
}

export interface ScoringSettings {
  speedBonus: boolean; // settings.speed_bonus, default true
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, "") // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

export function isAnswerCorrect(
  format: QuestionFormat,
  canonical: unknown,
  payload: unknown,
): boolean {
  const p = asRecord(payload);
  switch (format) {
    case "multiple_choice":
      return typeof p.choice === "number" && p.choice === canonical;
    case "true_false":
      return typeof p.choice === "boolean" && p.choice === canonical;
    case "number_closest":
      // "correct" for record-keeping means exact hit; points come from ranking.
      return typeof p.value === "number" && p.value === canonical;
    case "open_text": {
      const accept = (asRecord(canonical).accept as unknown[]) ?? [];
      if (typeof p.text !== "string") return false;
      const given = normalizeText(p.text);
      return (
        given.length > 0 &&
        accept.some((a) => typeof a === "string" && normalizeText(a) === given)
      );
    }
  }
}

// round(50 × time_remaining / time_limit), clamped to [0, MAX_SPEED_BONUS].
export function speedBonus(
  timeLimitS: number,
  deadlineMs: number,
  submittedAtMs: number,
): number {
  if (timeLimitS <= 0) return 0;
  const remainingS = (deadlineMs - submittedAtMs) / 1000;
  const clamped = Math.min(Math.max(remainingS, 0), timeLimitS);
  return Math.round(MAX_SPEED_BONUS * (clamped / timeLimitS));
}

export function clampWager(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.trunc(raw) : 0;
  return Math.min(Math.max(n, 0), MAX_WAGER);
}

// Scores one question for every team that answered. Teams that did not answer
// simply have no entry (0 points, handled by the caller as "no delta").
export function scoreQuestion(
  question: ScoringQuestion,
  answers: ScoringAnswer[],
  settings: ScoringSettings,
): TeamScore[] {
  // Final question: wager only — correct adds, wrong subtracts (PRD §5).
  if (question.isFinal) {
    return answers.map((a) => {
      const correct = isAnswerCorrect(question.format, question.answer, a.payload);
      const wager = clampWager(asRecord(a.payload).wager);
      return { teamId: a.teamId, isCorrect: correct, points: correct ? wager : -wager };
    });
  }

  // number_closest: 100 to nearest, 50 to second-nearest distance (ties share).
  if (question.format === "number_closest") {
    const target = typeof question.answer === "number" ? question.answer : NaN;
    const withDistance = answers.map((a) => {
      const v = asRecord(a.payload).value;
      const dist =
        typeof v === "number" && Number.isFinite(v) && Number.isFinite(target)
          ? Math.abs(v - target)
          : Number.POSITIVE_INFINITY;
      return { a, dist };
    });
    const distances = [...new Set(
      withDistance.filter((x) => Number.isFinite(x.dist)).map((x) => x.dist),
    )].sort((x, y) => x - y);
    const nearest = distances[0];
    const second = distances[1];
    return withDistance.map(({ a, dist }) => {
      const exact = dist === 0;
      let points = 0;
      if (dist === nearest && nearest !== undefined) points = CLOSEST_POINTS;
      else if (dist === second && second !== undefined) points = SECOND_CLOSEST_POINTS;
      return { teamId: a.teamId, isCorrect: exact, points };
    });
  }

  // multiple_choice / true_false / open_text: base + optional speed bonus.
  return answers.map((a) => {
    const correct = isAnswerCorrect(question.format, question.answer, a.payload);
    let points = 0;
    if (correct) {
      points = BASE_POINTS;
      if (settings.speedBonus) {
        points += speedBonus(question.timeLimitS, question.deadlineMs, a.submittedAtMs);
      }
    }
    return { teamId: a.teamId, isCorrect: correct, points };
  });
}
