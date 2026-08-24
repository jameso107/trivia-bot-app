// The option color system (fun pass, 2026-08-24). Kahoot taught the world
// that answer options with strong color identities read across a loud room —
// the phone button and the TV panel share a color, so "I picked blue" needs
// no reading. Solid fills chosen for WCAG AA at normal text sizes:
//   rose-600 + white ≈ 4.9:1 · sky-500 + zinc-950 ≈ 8.7:1
//   amber-400 + zinc-950 ≈ 10:1 · emerald-500 + zinc-950 ≈ 7.3:1
export interface OptionStyle {
  solid: string; // filled panel/button
  chip: string; // the A/B/C/D letter medallion
  bar: string; // reveal vote-distribution bar fill
  text: string; // text color on the solid fill
}

export const OPTION_STYLES: OptionStyle[] = [
  {
    solid: "bg-rose-600 border-rose-500",
    chip: "bg-white/20 text-white",
    bar: "bg-rose-600",
    text: "text-white",
  },
  {
    solid: "bg-sky-500 border-sky-400",
    chip: "bg-zinc-950/15 text-zinc-950",
    bar: "bg-sky-500",
    text: "text-zinc-950",
  },
  {
    solid: "bg-amber-400 border-amber-300",
    chip: "bg-zinc-950/15 text-zinc-950",
    bar: "bg-amber-400",
    text: "text-zinc-950",
  },
  {
    solid: "bg-emerald-500 border-emerald-400",
    chip: "bg-zinc-950/15 text-zinc-950",
    bar: "bg-emerald-500",
    text: "text-zinc-950",
  },
  // Options 5-6 (venue packs allow up to 6): calmer but still distinct.
  {
    solid: "bg-violet-500 border-violet-400",
    chip: "bg-white/20 text-white",
    bar: "bg-violet-500",
    text: "text-white",
  },
  {
    solid: "bg-orange-500 border-orange-400",
    chip: "bg-zinc-950/15 text-zinc-950",
    bar: "bg-orange-500",
    text: "text-zinc-950",
  },
];

export const optionStyle = (i: number): OptionStyle =>
  OPTION_STYLES[i % OPTION_STYLES.length];

// true/false share the semantic pair everywhere.
export const TRUE_STYLE = OPTION_STYLES[3]; // emerald
export const FALSE_STYLE = OPTION_STYLES[0]; // rose

// Round-intro washes rotate through the palette so each round gets a mood.
export const ROUND_WASH = [
  "from-rose-950/50",
  "from-sky-950/60",
  "from-amber-950/50",
  "from-emerald-950/50",
];
