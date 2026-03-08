// supabase/functions/resend-webhook/index.ts
// Receives Resend webhook events (Svix-signed), verifies, and stores to Supabase.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Webhook } from "npm:svix@1.84.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, svix-id, svix-timestamp, svix-signature",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_WEBHOOK_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET")!;

  try {
    // IMPORTANT: Use raw text body for signature verification
    const payload = await req.text();

    const svixId = req.headers.get("svix-id") ?? "";
    const svixTimestamp = req.headers.get("svix-timestamp") ?? "";
    const svixSignature = req.headers.get("svix-signature") ?? "";

    if (!svixId || !svixTimestamp || !svixSignature) {
      return new Response("Missing Svix headers", { status: 400, headers: corsHeaders });
    }

    const wh = new Webhook(RESEND_WEBHOOK_SECRET);
    const evt = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as any;

    // Example:
    // evt.type = "email.delivered" | "email.opened" | "email.clicked"
    // evt.created_at = ISO string
    // evt.data = { email_id, to, tags, user_agent, ip, ... }
    const type: string = evt?.type ?? "unknown";
    const createdAt: string | null = evt?.created_at ?? null;
    const data: any = evt?.data ?? {};

    // Tags are optional. We'll add proposal_id tags when sending.
    let tags: Array<{ name: string; value: string }> = [];
    if (Array.isArray(data?.tags)) {
      tags = data.tags as any;
    } else if (data?.tags && typeof data.tags === "object") {
      tags = Object.entries(data.tags).map(([name, value]) => ({
        name,
        value: String(value),
      }));
    }

    const proposalId =
      tags.find((t) => t.name === "proposal_id")?.value ??
      tags.find((t) => t.name === "proposalId")?.value ??
      "unknown";

    const recipientEmail =
      (Array.isArray(data?.to) ? data.to?.[0] : data?.to) ??
      data?.email ??
      "unknown";

    const resendEmailId: string | null = data?.email_id ?? data?.emailId ?? null;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { error } = await supabase.from("proposal_email_events").insert({
      proposal_id: String(proposalId),
      recipient_email: String(recipientEmail),
      event_type: String(type),
      resend_email_id: resendEmailId,
      user_agent: data?.user_agent ?? null,
      ip: data?.ip ?? null,
      metadata: { svix_id: svixId, resend: evt },
      occurred_at: createdAt ?? new Date().toISOString(),
    });

    if (error) {
      return new Response(JSON.stringify({ error }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response("Invalid webhook", { status: 400, headers: corsHeaders });
  }
});
