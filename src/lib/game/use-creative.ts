"use client";

// Ad slot plumbing (PRD §7): fetch the creative for a surface once per game,
// log the frozen ad_impression event per display. Config-driven — creatives
// come from ad_creatives (org-managed per §9), never an ad network.
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Creative {
  id: string;
  kind: "house" | "sponsor" | "venue_promo";
  surface: "screen" | "phone";
  headline: string | null;
  body: string | null;
  asset_path: string | null;
  cta_url: string | null;
}

export function useCreative(gameId: string | null, surface: "screen" | "phone") {
  const [creative, setCreative] = useState<Creative | null>(null);
  useEffect(() => {
    if (!gameId) return;
    let disposed = false;
    const supabase = createClient();
    supabase
      .rpc("pick_creative", { p_game_id: gameId, p_surface: surface })
      .then(({ data }) => {
        if (!disposed && data) setCreative(data as Creative);
      });
    return () => {
      disposed = true;
    };
  }, [gameId, surface]);
  return creative;
}

// Log one impression per display (a state-entry), never per re-render.
export function useImpression(
  creative: Creative | null,
  gameId: string | null,
  displayed: boolean,
  displayKey: string,
) {
  const loggedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!creative || !gameId || !displayed) return;
    if (loggedFor.current === displayKey) return;
    loggedFor.current = displayKey;
    const supabase = createClient();
    // supabase-js builders are lazy thenables — un-awaited calls never fire.
    supabase
      .rpc("log_ad_impression", {
        p_creative_id: creative.id,
        p_surface: creative.surface,
        p_game_id: gameId,
      })
      .then(({ error }) => {
        if (error) console.warn(`ad impression failed: ${error.message}`);
      });
  }, [creative, gameId, displayed, displayKey]);
}
