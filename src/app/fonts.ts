// Display font for the PUBLIC MARKETING surfaces only (VibeCurb pass).
// next/font self-hosts Outfit and injects it solely on pages that import
// this module — the player app and TV console never load a webfont byte
// (the 3G join budget and TV-legibility rules outrank aesthetics there).
import { Outfit } from "next/font/google";

export const displayFont = Outfit({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});
