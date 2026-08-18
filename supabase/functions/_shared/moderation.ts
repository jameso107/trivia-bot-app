// Name moderation for anything shown on a public TV (PRD §4: team names are
// profanity-filtered). PURE module — unit-tested from the app side, executed
// by the join edge function.
//
// Matching is per-token PREFIX against normalized tokens, not substring, so
// "Sour Grapes" and "Scunthorpe" pass while "rapey"/"shitshow" don't (the
// Scunthorpe problem). v1 is deliberately coarse; the org's content ops can
// move this to a table later without changing the contract.
const BLOCKED_PREFIXES = [
  "fuck",
  "shit",
  "cunt",
  "nigg",
  "fagg",
  "rape",
  "rapist",
  "hitler",
  "nazi",
];

export const NAME_MAX = 24;

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function isNameAllowed(name: string): boolean {
  return tokens(name).every(
    (t) => !BLOCKED_PREFIXES.some((bad) => t.startsWith(bad)),
  );
}

// Trim/collapse whitespace, clamp length, reject empty or blocked names.
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim().slice(0, NAME_MAX).trim();
  if (name.length < 1) return null;
  if (!isNameAllowed(name)) return null;
  return name;
}
