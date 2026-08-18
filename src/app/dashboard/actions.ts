"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Game-default keys a venue can set; merged into each created game's settings.
const GAME_DEFAULT_KEYS = ["speed_bonus", "team_edits", "auto_host", "tts_enabled"] as const;

export async function startGame(packId: string) {
  const supabase = await createClient();

  // Venue defaults ride into the night's settings (PRD §7 settings toggles).
  const { data: membership } = await supabase
    .from("venue_members")
    .select("venue_id, venues(settings)")
    .limit(1)
    .maybeSingle();
  const venueSettings =
    ((membership?.venues as unknown as { settings: Record<string, unknown> } | null)
      ?.settings as Record<string, unknown> | undefined) ?? {};
  const gameSettings: Record<string, unknown> = {};
  for (const key of GAME_DEFAULT_KEYS) {
    if (typeof venueSettings[key] === "boolean") gameSettings[key] = venueSettings[key];
  }

  const { data: gameId, error } = await supabase.rpc("create_game", {
    p_pack_id: packId,
    p_settings: gameSettings,
  });
  if (error || !gameId) {
    const message = error?.message?.includes("not a venue member")
      ? "Your account isn't attached to a venue yet — run the setup above."
      : (error?.message ?? "could not create the game");
    redirect(`/dashboard?error=${encodeURIComponent(message)}`);
  }
  redirect(`/host/${gameId}`);
}

export async function signupVenue(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("signup_venue", {
    p_name: String(formData.get("name") ?? ""),
    p_metro: String(formData.get("metro") ?? ""),
    p_slug: String(formData.get("slug") ?? ""),
  });
  if (error) {
    redirect(`/dashboard?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/dashboard?welcome=1");
}

export async function updateVenueSettings(venueId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: venue } = await supabase
    .from("venues")
    .select("settings")
    .eq("id", venueId)
    .maybeSingle();
  const current = (venue?.settings as Record<string, unknown> | null) ?? {};
  const next = { ...current } as Record<string, unknown>;
  for (const key of GAME_DEFAULT_KEYS) {
    next[key] = formData.get(key) === "on";
  }
  const { error } = await supabase.from("venues").update({ settings: next }).eq("id", venueId);
  redirect(
    error
      ? `/dashboard?error=${encodeURIComponent(error.message)}`
      : "/dashboard?saved=1",
  );
}

export async function requestCustomPack(formData: FormData) {
  const supabase = await createClient();
  const countRaw = Number(formData.get("question_count"));
  const { error } = await supabase.rpc("request_custom_pack", {
    p_topic: String(formData.get("topic") ?? ""),
    p_notes: String(formData.get("notes") ?? "") || null,
    p_question_count: Number.isFinite(countRaw) && countRaw > 0 ? countRaw : 40,
  });
  redirect(
    error
      ? `/dashboard?error=${encodeURIComponent(error.message)}`
      : "/dashboard?requested=1",
  );
}

export async function submitVenueFeedback(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_feedback", {
    p_source: "venue",
    p_body: String(formData.get("body") ?? ""),
  });
  redirect(
    error
      ? `/dashboard?error=${encodeURIComponent(error.message)}`
      : "/dashboard?feedback=sent",
  );
}

export async function logPromoDownload() {
  const supabase = await createClient();
  await supabase.rpc("log_promo_kit_download");
}
