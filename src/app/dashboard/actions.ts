"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function startGame(packId: string) {
  const supabase = await createClient();
  const { data: gameId, error } = await supabase.rpc("create_game", {
    p_pack_id: packId,
  });
  if (error || !gameId) {
    const message = error?.message?.includes("not a venue member")
      ? "Your account isn't attached to a venue yet — venue setup arrives with M5."
      : (error?.message ?? "could not create the game");
    redirect(`/dashboard?error=${encodeURIComponent(message)}`);
  }
  redirect(`/host/${gameId}`);
}
