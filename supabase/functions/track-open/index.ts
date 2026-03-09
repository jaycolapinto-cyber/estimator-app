// supabase/functions/track-open/index.ts
// Logs email open events and returns a 1x1 gif

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GIF_1x1 = Uint8Array.from([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255,
  33, 249, 4, 1, 0, 0, 1, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68,
  1, 0, 59,
]);

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const tid = (url.searchParams.get("tid") || "").trim();
    if (!tid) {
      return new Response("missing tid", { status: 400 });
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
      event_type: "open",
      url: null,
      ip: req.headers.get("x-forwarded-for") || null,
      user_agent: req.headers.get("user-agent") || null,
    });

    return new Response(GIF_1x1, {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch {
    return new Response(GIF_1x1, {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  }
});
