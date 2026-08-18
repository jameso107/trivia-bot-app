// Sign a seeded host into a browser context via an admin-generated magic
// link token — the same /auth/confirm path production links travel.
import type { Page } from "@playwright/test";
import { adminClient, anonKey, supabaseUrl } from "./admin";

export async function loginAsHost(page: Page, email: string): Promise<void> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) throw error;
  const tokenHash = data.properties.hashed_token;
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/dashboard`);
  await page.waitForURL(/\/dashboard/);
}

// Access token for API-only tests (no browser): verify an admin-minted magic
// link token with the anon client and lift the session.
export async function hostAccessToken(email: string): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) throw error;
  const { createClient } = await import("@supabase/supabase-js");
  const anon = createClient(supabaseUrl(), anonKey(), {
    auth: { persistSession: false },
  });
  const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
    type: "email",
    token_hash: data.properties.hashed_token,
  });
  if (verifyErr) throw verifyErr;
  return verified.session!.access_token;
}
