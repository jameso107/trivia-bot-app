// Load test (PRD §10 M7): N simulated players against one game, over the same
// API paths real phones use — join, realtime subscription, answer submission.
// Reports join latency percentiles, answer acceptance, and broadcast receipt.
//
//   node scripts/load-test.mjs [--players 150] [--url ... --anon ... via env]
//
// Runs against the LOCAL stack by default (auto-discovers env like the E2E
// helpers). Not a CI gate: it's a runbook tool — run it before scaling bets.
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const PLAYERS = Number(process.argv[process.argv.indexOf("--players") + 1]) || 150;

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
      if (m[1] === "ANON_KEY") process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= m[2];
      if (m[1] === "SERVICE_ROLE_KEY") process.env.SUPABASE_SERVICE_ROLE_KEY ??= m[2];
    }
  }
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    service: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

const { url, anon, service } = env();
const admin = createClient(url, service, { auth: { persistSession: false } });
const fns = `${url}/functions/v1`;

async function fn(name, body) {
  const res = await fetch(`${fns}/${name}`, {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function pct(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

// ---- seed: venue + host + game on a library pack ----
const suffix = randomUUID().slice(0, 8);
const { data: venue } = await admin
  .from("venues")
  .insert({ name: `Load Test ${suffix}`, metro: "Detroit" })
  .select("id")
  .single();
const email = `load-${suffix}@example.com`;
const { data: userRes } = await admin.auth.admin.createUser({ email, email_confirm: true });
await admin.from("venue_members").insert({ venue_id: venue.id, user_id: userRes.user.id });
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
const anonClient = createClient(url, anon, { auth: { persistSession: false } });
const { data: verified } = await anonClient.auth.verifyOtp({
  type: "email",
  token_hash: link.properties.hashed_token,
});
const hostToken = verified.session.access_token;
const { data: pack } = await admin.from("packs").select("id").eq("status", "live").limit(1).single();
const code = Array.from({ length: 4 }, () =>
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)],
).join("");
const { data: game } = await admin
  .from("games")
  .insert({
    venue_id: venue.id,
    pack_id: pack.id,
    join_code: code,
    settings: { speed_bonus: true, auto_host: false },
  })
  .select("id")
  .single();

async function advance(expected) {
  const res = await fetch(`${fns}/advance-game`, {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${hostToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ gameId: game.id, expectedState: expected }),
  });
  if (!res.ok) throw new Error(`advance from ${expected} failed: ${res.status}`);
  return (await res.json()).state;
}

console.log(`seeded game ${game.id} (${code}); joining ${PLAYERS} players…`);

// ---- join swarm (teams of ~4) + one realtime subscriber per team ----
const joinTimes = [];
const players = [];
let broadcastsSeen = 0;
const teamCount = Math.ceil(PLAYERS / 4);
const joinResults = await Promise.allSettled(
  Array.from({ length: PLAYERS }, async (_, i) => {
    const t0 = Date.now();
    const r = await fn("join-game", {
      code,
      displayName: `P${i}`,
      ...(i < teamCount ? { teamName: `Team ${i}` } : { teamName: `Team ${i % teamCount}` }),
    });
    if (!r.ok) throw new Error(`join ${i}: ${r.status} ${JSON.stringify(r.data)}`);
    joinTimes.push(Date.now() - t0);
    players.push(r.data);
  }),
);
const joined = joinResults.filter((r) => r.status === "fulfilled").length;

// One websocket subscriber per ~10 players (consoles + a sample of phones).
const subscribers = [];
for (let i = 0; i < Math.max(3, Math.floor(PLAYERS / 10)); i++) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  c.channel(`game:${game.id}`)
    .on("broadcast", { event: "state" }, () => {
      broadcastsSeen++;
    })
    .subscribe();
  subscribers.push(c);
}
await new Promise((r) => setTimeout(r, 1500));

// ---- play one question with the full room ----
let state = await advance("lobby");
state = await advance("round_intro");
const questionId = state.question.id;

const answerTimes = [];
let accepted = 0;
let rejected = 0;
await Promise.allSettled(
  players.map(async (p, i) => {
    const t0 = Date.now();
    const r = await fn("submit-answer", {
      answerId: randomUUID(),
      gameId: game.id,
      questionId,
      playerId: p.playerId,
      deviceKey: p.deviceKey,
      payload: { choice: i % 4 },
    });
    answerTimes.push(Date.now() - t0);
    if (r.ok) accepted++;
    else if (r.data?.reason === "team_locked") rejected++; // teammates: by design
    else throw new Error(`answer ${i}: ${r.status} ${JSON.stringify(r.data)}`);
  }),
);

await advance("question");
await advance("locked");
await new Promise((r) => setTimeout(r, 2000));

joinTimes.sort((a, b) => a - b);
answerTimes.sort((a, b) => a - b);
const { count: answersStored } = await admin
  .from("answers")
  .select("id", { count: "exact", head: true })
  .eq("game_id", game.id);

console.log(`
== load test: ${PLAYERS} players, ${teamCount} teams ==
joins        ${joined}/${PLAYERS} ok — p50 ${pct(joinTimes, 50)}ms · p95 ${pct(joinTimes, 95)}ms · max ${joinTimes.at(-1)}ms
answers      ${accepted} accepted + ${rejected} team-locked (expected: ~1 accepted/team) — p50 ${pct(answerTimes, 50)}ms · p95 ${pct(answerTimes, 95)}ms
stored       ${answersStored} answer rows (== teams that answered)
broadcasts   ${broadcastsSeen} state events across ${subscribers.length} subscribers (4 transitions each expected)
verdict      ${joined === PLAYERS && answersStored === teamCount ? "PASS — no dropped joins or answers" : "CHECK — see numbers above"}
`);
for (const c of subscribers) await c.removeAllChannels();
process.exit(0);
