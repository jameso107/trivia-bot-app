"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// The landing page's inbound-lead form. Lands as an org events row
// (kind=website_inquiry) via the public submit_inquiry RPC — the same wake-up
// channel venue signups use, so the CX agents work it on their normal sweeps.
export async function submitInquiry(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_inquiry", {
    p_email: String(formData.get("email") ?? ""),
    p_message: String(formData.get("message") ?? "") || null,
  });
  redirect(error ? `/?inquiry=error&why=${encodeURIComponent(error.message)}#talk` : "/?inquiry=sent#talk");
}
