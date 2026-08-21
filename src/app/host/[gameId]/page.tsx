import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { Console } from "./console";

export const metadata = { title: "Host console — TRIVIUM" };

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

  // Prefer the pinned canonical origin; header-derived origin is the fallback
  // for local/preview. The QR every phone scans must never trust a spoofable
  // Host header when a canonical origin exists.
  const h = await headers();
  const envOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  const headerOrigin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  const origin = envOrigin && envOrigin.startsWith("http") ? envOrigin : headerOrigin;
  const joinUrl = `${origin}/j/${game.join_code}`;

  const qrSvg = await QRCode.toString(joinUrl, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2, // quiet zone (PRD §6)
    color: { dark: "#18181b", light: "#fafafa" },
  });

  return <Console gameId={game.id} joinUrl={joinUrl} qrSvg={qrSvg} />;
}
