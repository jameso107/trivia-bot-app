import { describe, expect, it } from "vitest";
import {
  JOIN_CODE_ALPHABET,
  generateJoinCode,
  isValidJoinCode,
  normalizeJoinCode,
} from "./join-code";

describe("join code alphabet", () => {
  it("has 32 characters with no ambiguous glyphs (PRD §4)", () => {
    expect(JOIN_CODE_ALPHABET).toHaveLength(32);
    for (const banned of ["0", "O", "1", "I"]) {
      expect(JOIN_CODE_ALPHABET).not.toContain(banned);
    }
    expect(new Set(JOIN_CODE_ALPHABET).size).toBe(JOIN_CODE_ALPHABET.length);
  });
});

describe("generateJoinCode", () => {
  it("produces valid codes across many draws", () => {
    for (let i = 0; i < 1000; i++) {
      const code = generateJoinCode();
      expect(isValidJoinCode(code)).toBe(true);
    }
  });

  it("covers the alphabet edges deterministically", () => {
    expect(generateJoinCode(() => 0)).toBe("AAAA");
    expect(generateJoinCode(() => 0.999999)).toBe("9999");
  });
});

describe("isValidJoinCode", () => {
  it("accepts codes drawn from the alphabet", () => {
    expect(isValidJoinCode("KX7Q")).toBe(true);
  });

  it("rejects wrong lengths, ambiguous chars, and lowercase", () => {
    expect(isValidJoinCode("")).toBe(false);
    expect(isValidJoinCode("KX7")).toBe(false);
    expect(isValidJoinCode("KX7QQ")).toBe(false);
    expect(isValidJoinCode("K0XQ")).toBe(false); // zero
    expect(isValidJoinCode("KOXQ")).toBe(false); // letter O
    expect(isValidJoinCode("K1XQ")).toBe(false); // one
    expect(isValidJoinCode("KIXQ")).toBe(false); // letter I
    expect(isValidJoinCode("kx7q")).toBe(false); // callers normalize first
  });
});

describe("normalizeJoinCode", () => {
  it("trims and uppercases player input", () => {
    expect(normalizeJoinCode("  kx7q ")).toBe("KX7Q");
    expect(isValidJoinCode(normalizeJoinCode(" kx7q"))).toBe(true);
  });
});
