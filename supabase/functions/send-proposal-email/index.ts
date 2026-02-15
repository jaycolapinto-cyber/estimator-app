// supabase/functions/send-proposal-email/index.ts
// Sends an email via Resend (with optional PDF attachment) + tags for open/click tracking

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Payload = {
  to: string; // recipient email
  proposalId?: string;
  subject: string;
  html: string; // email body (HTML)

  // ✅ REQUIRED: where replies should go (per-user / per-company)
  replyTo: string;

  // optional attachment (base64 PDF, no data: prefix)
  pdfBase64?: string;
  filename?: string; // ex: "Proposal.pdf"
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Payload;

    // ✅ Validate required fields (including replyTo)
    if (!body?.to || !body?.subject || !body?.html || !body?.replyTo) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: to, subject, html, replyTo",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const replyTo = String(body.replyTo || "").trim();
    if (!replyTo) {
      return new Response(
        JSON.stringify({
          error: "replyTo is required and cannot be empty",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ✅ Verified sending address (domain verified in Resend)
    // IMPORTANT: do NOT brand this as Decks Unique — this is your platform sender identity.
    const from = "Estimator <send@estimator.trade>";

    const resendPayload: any = {
      from,

      // ✅ Resend expects "reply_to" (works) — we pass the per-user email here
      reply_to: replyTo,

      to: body.to,
      subject: body.subject,
      html: body.html,

      ...(body.proposalId
        ? { tags: [{ name: "proposal_id", value: body.proposalId }] }
        : {}),

      // plain text fallback helps deliverability
      text: body.html
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<\/(p|div|br|li|h1|h2|h3|tr)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
    };

    if (body.pdfBase64) {
      resendPayload.attachments = [
        {
          filename: body.filename || "Proposal.pdf",
          content: body.pdfBase64, // base64 string
        },
      ];
    }

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendPayload),
    });

    const data = await r.json();

    if (!r.ok) {
      return new Response(JSON.stringify({ error: data }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
