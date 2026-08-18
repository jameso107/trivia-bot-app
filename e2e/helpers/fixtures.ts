// Seeds one complete synthetic night: venue + host + a live fixture pack
// (2 rounds × 2 questions + a final wager) + a lobby-state game.
import { adminClient } from "./admin";
import { generateJoinCode } from "../../src/lib/join-code";

export interface FixtureQuestion {
  id: string;
  round: number;
  position: number;
  format: "multiple_choice" | "true_false" | "number_closest" | "open_text";
  prompt: string;
  options: string[] | null;
  answer: unknown;
  time_limit_s: number;
}

export interface SyntheticNight {
  suffix: string;
  venueId: string;
  hostEmail: string;
  hostUserId: string;
  packId: string;
  gameId: string;
  joinCode: string;
  questions: FixtureQuestion[];
}

export async function seedSyntheticNight(): Promise<SyntheticNight> {
  const admin = adminClient();
  // Parallel workers seed simultaneously — a clock-based suffix collides.
  const suffix = crypto.randomUUID().slice(0, 8);

  const { data: venue, error: venueErr } = await admin
    .from("venues")
    .insert({ name: `E2E Taproom ${suffix}`, metro: "Detroit", status: "active" })
    .select("id")
    .single();
  if (venueErr) throw venueErr;

  const hostEmail = `e2e-host-${suffix}@example.com`;
  const { data: userRes, error: userErr } = await admin.auth.admin.createUser({
    email: hostEmail,
    email_confirm: true,
  });
  if (userErr) throw userErr;
  const hostUserId = userRes.user.id;

  const { error: memberErr } = await admin
    .from("venue_members")
    .insert({ venue_id: venue.id, user_id: hostUserId, role: "owner" });
  if (memberErr) throw memberErr;

  const { data: pack, error: packErr } = await admin
    .from("packs")
    .insert({
      title: `Synthetic Night ${suffix}`,
      topic: "general",
      description: "QA fixture pack — 2 rounds + final",
      question_count: 5,
      rounds: 2,
      status: "live",
      created_by: "seed",
      difficulty_curve: [2.2, 2.8],
    })
    .select("id")
    .single();
  if (packErr) throw packErr;

  const questionSeed = [
    {
      round: 1,
      position: 1,
      format: "multiple_choice" as const,
      prompt: "Which planet is known as the Red Planet?",
      options: ["Venus", "Mars", "Jupiter", "Saturn"],
      answer: 1,
      answer_note: "source: NASA — iron oxide gives Mars its color",
      difficulty: 1.5,
      time_limit_s: 20,
    },
    {
      round: 1,
      position: 2,
      format: "true_false" as const,
      prompt: "The Great Lakes hold about 20% of Earth's surface fresh water.",
      options: null,
      answer: true,
      answer_note: "source: EPA Great Lakes facts",
      difficulty: 2.5,
      time_limit_s: 20,
    },
    {
      round: 2,
      position: 1,
      format: "number_closest" as const,
      prompt: "In what year was the Ford Model T first produced?",
      options: null,
      answer: 1908,
      answer_note: "source: The Henry Ford museum",
      difficulty: 3.0,
      time_limit_s: 20,
    },
    {
      round: 2,
      position: 2,
      format: "open_text" as const,
      prompt: "Which band recorded the album Abbey Road?",
      options: null,
      answer: { accept: ["The Beatles", "Beatles"] },
      answer_note: "source: Apple Records discography",
      difficulty: 2.0,
      time_limit_s: 20,
    },
    {
      round: 3, // final = rounds + 1 (engine convention)
      position: 1,
      format: "multiple_choice" as const,
      prompt: "Which Great Lake lies entirely within the United States?",
      options: ["Huron", "Michigan", "Erie", "Superior"],
      answer: 1,
      answer_note: "source: NOAA — the other four straddle the Canadian border",
      difficulty: 4.0,
      time_limit_s: 25,
    },
  ];

  const { data: qRows, error: qErr } = await admin
    .from("pack_questions")
    .insert(questionSeed.map((q) => ({ ...q, pack_id: pack.id })))
    .select("id, round, position, format, prompt, options, answer, time_limit_s");
  if (qErr) throw qErr;

  const joinCode = generateJoinCode();
  const { data: game, error: gameErr } = await admin
    .from("games")
    .insert({
      venue_id: venue.id,
      pack_id: pack.id,
      join_code: joinCode,
      state: "lobby",
      settings: { speed_bonus: true },
    })
    .select("id")
    .single();
  if (gameErr) throw gameErr;

  const questions = (qRows as FixtureQuestion[]).sort(
    (a, b) => a.round - b.round || a.position - b.position,
  );

  return {
    suffix,
    venueId: venue.id,
    hostEmail,
    hostUserId,
    packId: pack.id,
    gameId: game.id,
    joinCode,
    questions,
  };
}
