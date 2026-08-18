import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Magic-link landing. Handles both verification shapes:
//  * token_hash + type — links from templates using {{ .TokenHash }}
//    (works cross-device; local templates append it to the redirect URL)
//  * code — default hosted templates via the PKCE flow (same-browser)
// `next` decides where a verified user lands (dashboard, the save-moment
// completion, ...). Relative paths only — anything absolute is dropped so the
// emailed link can never bounce a session to a foreign origin.
function safeNext(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.redirect(
    new URL("/login?error=That%20link%20expired%20or%20was%20already%20used%20—%20request%20a%20new%20one", request.url),
  );
}
