import { PlayerGame } from "./player-game";

export const metadata = { title: "Join the game — TRIVIUM" };

// The QR target (PRD §7): everything happens client-side so the page shell
// stays static and tiny — the join path owns the <10s bar-wifi budget.
export default async function JoinPage({ params }: PageProps<"/j/[code]">) {
  const { code } = await params;
  return <PlayerGame code={code.toUpperCase()} />;
}
