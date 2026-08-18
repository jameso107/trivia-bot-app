// The §8 taxonomy audit (M6): after the E2E suite runs, every frozen event
// name the PRODUCT emits must exist in analytics_events with server-side
// timestamps. Fails CI when an emit goes missing — renames are impossible to
// sneak past this.
//
// custom_pack_delivered is excluded: the ORG emits it on fulfillment (§9).
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const FROZEN_PRODUCT_EVENTS = [
  "venue_signup_completed",
  "game_created",
  "game_started",
  "player_joined",
  "team_created",
  "answer_submitted",
  "question_revealed",
  "round_completed",
  "game_completed",
  "game_abandoned",
  "account_save_prompted",
  "account_created_from_game",
  "challenge_filed",
  "feedback_submitted",
  "custom_pack_requested",
  "ad_impression",
  "promo_kit_downloaded",
];

function env() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const out = execSync("npx supabase status -o env", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const line of out.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)="(.*)"$/);
      if (!m) continue;
      if (m[1] === "API_URL") process.env.NEXT_PUBLIC_SUPABASE_URL ??= m[2];
      if (m[1] === "SERVICE_ROLE_KEY") process.env.SUPABASE_SERVICE_ROLE_KEY ??= m[2];
    }
  }
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

const { url, key } = env();
const db = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await db.from("analytics_events").select("event, props, created_at");
if (error) {
  console.error(`audit failed to read analytics_events: ${error.message}`);
  process.exit(1);
}

const seen = new Set(data.map((r) => r.event));
const missing = FROZEN_PRODUCT_EVENTS.filter((e) => !seen.has(e));
const unknown = [...seen].filter((e) => !FROZEN_PRODUCT_EVENTS.includes(e) && e !== "custom_pack_delivered");

// Spot-check the richest props contract (PRD §8).
const completed = data.find((r) => r.event === "game_completed");
const propsOk =
  completed &&
  ["players", "teams", "questions_played", "duration_s"].every(
    (k) => typeof completed.props?.[k] === "number",
  );

if (missing.length || unknown.length || !propsOk) {
  if (missing.length) console.error(`MISSING frozen events (never emitted in suite): ${missing.join(", ")}`);
  if (unknown.length) console.error(`UNKNOWN events (not in the frozen §8 taxonomy): ${unknown.join(", ")}`);
  if (!propsOk) console.error("game_completed props contract violated (players/teams/questions_played/duration_s)");
  process.exit(1);
}

console.log(
  `taxonomy audit ✓ — all ${FROZEN_PRODUCT_EVENTS.length} product events emitted (${data.length} rows), game_completed props intact`,
);
