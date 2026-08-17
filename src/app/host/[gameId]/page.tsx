import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { Console } from "./console";

export const metadata = { title: "Host console — Trivia Bot" };

// The TV. Auth gate is server-side: only members of the game's venue get in
// (RLS backs the query — a non-member sees no row at all).
export default async function HostPage({ params }: PageProps<"/host/[gameId]">) {
  const { gameId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: game } = await supabase
    .from("games")
    .select("id, join_code")
    .eq("id", gameId)
    .maybeSingle();
  if (!game) notFound();

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  const joinUrl = `${proto}://${host}/j/${game.join_code}`;

  const qrSvg = await QRCode.toString(joinUrl, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2, // quiet zone (PRD §6)
    color: { dark: "#18181b", light: "#fafafa" },
  });

  return <Console gameId={game.id} joinUrl={joinUrl} qrSvg={qrSvg} />;
}
