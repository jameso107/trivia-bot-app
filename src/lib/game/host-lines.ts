"use client";

// Auto-host personality lines: fetched once per console session from
// host_lines (public RLS read on active rows — the org's content ops update
// them with no deploy, PRD §9). Lines cycle per slot without repeats until a
// pool is exhausted, so a 4-round night doesn't echo itself.
import { createClient } from "@/lib/supabase/client";

export type HostSlot =
  | "lobby"
  | "round_intro"
  | "pre_reveal"
  | "post_reveal_correct"
  | "post_reveal_brutal"
  | "intermission"
  | "final_intro"
  | "podium"
  | "close";

export interface HostLine {
  id: string;
  slot: HostSlot;
  text: string;
  tone: string | null;
  tts_audio_path: string | null;
}

export type LinePicker = (slot: HostSlot) => HostLine | null;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function loadLinePicker(): Promise<LinePicker> {
  const supabase = createClient();
  const { data } = await supabase
    .from("host_lines")
    .select("id, slot, text, tone, tts_audio_path")
    .eq("active", true);

  const pools = new Map<HostSlot, HostLine[]>();
  const cursors = new Map<HostSlot, number>();
  for (const line of (data ?? []) as HostLine[]) {
    const pool = pools.get(line.slot) ?? [];
    pool.push(line);
    pools.set(line.slot, pool);
  }
  for (const [slot, pool] of pools) {
    pools.set(slot, shuffle(pool));
    cursors.set(slot, 0);
  }

  return (slot) => {
    const pool = pools.get(slot);
    if (!pool || pool.length === 0) return null;
    let cursor = cursors.get(slot) ?? 0;
    if (cursor >= pool.length) {
      pools.set(slot, shuffle(pool));
      cursor = 0;
    }
    cursors.set(slot, cursor + 1);
    return pools.get(slot)![cursor];
  };
}

// Public URL for a pre-generated TTS clip in the host-audio bucket.
export function ttsUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/host-audio/${path}`;
}
