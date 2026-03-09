// supabase/functions/track-click/index.ts
// Logs email click events and redirects to destination URL

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const tid = (url.searchParams.get("tid") || "").trim();
    const dest = (url.searchParams.get("url") || "").trim();
    if (!tid || !dest) {
      return new Response("missing tid or url", { status: 400 });
    }

    const decoded = decodeURIComponent(dest);
    if (!decoded.startsWith("http://") && !decoded.startsWith("https://")) {
      return new Response("invalid url", { status: 400 });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY"
    )!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    await supabase.from("proposal_tracking_events").insert({
      proposal_id: tid,
      event_type: "click",
      url: decoded,
      ip: req.headers.get("x-forwarded-for") || null,
      user_agent: req.headers.get("user-agent") || null,
    });

    return new Response(null, {
      status: 302,
      headers: { Location: decoded },
    });
  } catch (err) {
    return new Response("error", { status: 400 });
  }
});
