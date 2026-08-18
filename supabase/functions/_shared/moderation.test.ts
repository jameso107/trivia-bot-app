import { describe, expect, it } from "vitest";
import { cleanName, isNameAllowed, NAME_MAX } from "./moderation.ts";

describe("isNameAllowed", () => {
  it("blocks profane tokens and obvious variants", () => {
    expect(isNameAllowed("the shitshow")).toBe(false);
    expect(isNameAllowed("F*ck")).toBe(true); // symbols split tokens; 'f' + 'ck'
    expect(isNameAllowed("fuckers united")).toBe(false);
    expect(isNameAllowed("Rapey McTeam")).toBe(false);
    expect(isNameAllowed("literal nazis")).toBe(false);
  });

  it("does NOT block innocent names containing bad substrings (Scunthorpe)", () => {
    expect(isNameAllowed("Sour Grapes")).toBe(true);
    expect(isNameAllowed("Scunthorpe United")).toBe(true);
    expect(isNameAllowed("Grape Apes")).toBe(true);
    expect(isNameAllowed("Therapists")).toBe(true); // 'therapists' ≠ 'rapist' prefix
    expect(isNameAllowed("Shiitake Crew")).toBe(true);
  });
});

describe("cleanName", () => {
  it("trims, collapses whitespace, clamps length", () => {
    expect(cleanName("  The   Quizzards  ")).toBe("The Quizzards");
    const long = "A".repeat(NAME_MAX + 10);
    expect(cleanName(long)).toHaveLength(NAME_MAX);
  });

  it("rejects empty, non-string, and blocked names", () => {
    expect(cleanName("")).toBeNull();
    expect(cleanName("   ")).toBeNull();
    expect(cleanName(42)).toBeNull();
    expect(cleanName("shit crew")).toBeNull();
  });
});
