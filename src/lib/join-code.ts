// Join codes: 4 chars from an unambiguous alphabet (PRD §4 — no 0/O/1/I).
// 32^4 = ~1.05M combinations; collisions are handled by the caller retrying
// against the games.join_code unique constraint.
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 4;

export function generateJoinCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET[Math.floor(random() * JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

// Forgiving input: trims and uppercases (a player typing "kx7q" meant "KX7Q").
export function normalizeJoinCode(input: string): string {
  return input.trim().toUpperCase();
}

export function isValidJoinCode(code: string): boolean {
  return (
    code.length === JOIN_CODE_LENGTH &&
    [...code].every((c) => JOIN_CODE_ALPHABET.includes(c))
  );
}
