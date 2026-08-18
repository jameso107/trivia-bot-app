// Test-only service-role access. This is the QA harness acting as the trusted
// backend (seeding fixtures, auditing results) — the app itself never touches
// this key. Env comes from CI; locally it is auto-discovered from the running
// `supabase start` stack for zero-setup DX.
import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function discoverLocalEnv(): void {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  try {
    const out = execSync("npx supabase status -o env", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const line of out.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)="(.*)"$/);
      if (!m) continue;
      if (m[1] === "API_URL" && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
        process.env.NEXT_PUBLIC_SUPABASE_URL = m[2];
      }
      if (m[1] === "ANON_KEY" && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = m[2];
      }
      if (m[1] === "SERVICE_ROLE_KEY" && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        process.env.SUPABASE_SERVICE_ROLE_KEY = m[2];
      }
    }
  } catch {
    // No local stack — env must be provided (CI does).
  }
}

let cached: SupabaseClient | null = null;

export function adminClient(): SupabaseClient {
  if (cached) return cached;
  discoverLocalEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — start the local stack (npm run db:start) or set env.",
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export function supabaseUrl(): string {
  discoverLocalEnv();
  return process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

export function functionsBase(): string {
  return `${supabaseUrl()}/functions/v1`;
}

export function anonKey(): string {
  discoverLocalEnv();
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
}
