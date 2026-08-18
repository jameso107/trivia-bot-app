// Read magic-link emails from the local Mailpit (the stack's mail sink).
import { supabaseUrl } from "./admin";

function mailpitBase(): string {
  // Mailpit rides the API host on the mail port (55324 locally/CI).
  const url = new URL(supabaseUrl());
  url.port = "55324";
  return url.origin;
}

export async function latestEmailLink(toEmail: string): Promise<string> {
  const base = mailpitBase();
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await fetch(
      `${base}/api/v1/search?query=${encodeURIComponent(`to:${toEmail}`)}`,
    );
    const data = (await res.json()) as { messages?: Array<{ ID: string }> };
    const id = data.messages?.[0]?.ID;
    if (id) {
      const msgRes = await fetch(`${base}/api/v1/message/${id}`);
      const msg = (await msgRes.json()) as { HTML?: string; Text?: string };
      const haystack = `${msg.HTML ?? ""}\n${msg.Text ?? ""}`;
      const match = haystack.match(/https?:\/\/[^\s"'<>]+token_hash=[^\s"'<>]+/);
      if (match) {
        // HTML entity-decode the essentials (&amp; in hrefs).
        return match[0].replaceAll("&amp;", "&");
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no magic-link email arrived for ${toEmail}`);
}
