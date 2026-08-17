import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Anon key + RLS only — the service-role key is
// the org daemon's and must never appear in this app (CLAUDE.md hard rule).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
