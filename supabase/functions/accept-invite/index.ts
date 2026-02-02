// supabase/functions/accept-invite/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v || "");
}

async function insertMember(params: {
  admin: any;
  acctId: string;
  userId: string;
  role: "admin" | "user";
}) {
  const { admin, acctId, userId, role } = params;

  // Try org_id first
  const ins1 = await admin.from("org_members").insert({
    user_id: userId,
    role,
    // @ts-ignore
    org_id: acctId,
  });

  if (!ins1.error) return;

  const msg = (ins1.error?.message || "").toLowerCase();
  const missingOrgIdColumn =
    msg.includes("column") &&
    msg.includes("org_id") &&
    (msg.includes("does not exist") || msg.includes("not found"));

  if (!missingOrgIdColumn) throw new Error(ins1.error.message);

  // Fallback to account_id
  const ins2 = await admin.from("org_members").insert({
    user_id: userId,
    role,
    // @ts-ignore
    account_id: acctId,
  });

  if (ins2.error) throw new Error(ins2.error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed. Use POST." });

  try {
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Missing Authorization header" });
    const accessToken = authHeader.replace("Bearer ", "").trim();

    let payload: any;
    try {
      payload = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body." });
    }

    const acctId = String(payload?.account_id || payload?.org_id || "");
    if (!isUuid(acctId)) return json(400, { error: "Missing/invalid account_id (or org_id)." });

    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url) return json(500, { error: "SUPABASE_URL missing." });
    if (!serviceKey) return json(500, { error: "SUPABASE_SERVICE_ROLE_KEY missing." });

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Identify caller (the person who just logged in)
    const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);
    if (userErr || !userData?.user) return json(401, { error: "Invalid user session" });

    const userId = userData.user.id;
    const email = String(userData.user.email || "").toLowerCase();
    if (!email) return json(400, { error: "User email missing." });

    // Look for an invite for this email + org
    const inviteRes = await admin
      .from("org_invites")
      .select("id, email, role, status")
      .eq("account_id", acctId)
      .eq("email", email)
      .maybeSingle();

    // If there is no invite row, do nothing (still ok)
    if (inviteRes.error) return json(400, { error: inviteRes.error.message });

    const invite = inviteRes.data;
    if (!invite) {
      return json(200, { ok: true, accepted: false, reason: "No invite found for this org/email." });
    }

    // If already accepted, also ok (idempotent)
    const currentStatus = String(invite.status || "");
    const role = (String(invite.role || "").toLowerCase() === "admin" ? "admin" : "user") as "admin" | "user";

    // Ensure membership exists
    // (If you have a unique constraint on org_members, duplicates will fail — but this call is still safe.)
    await insertMember({ admin, acctId, userId, role });

    // Update app_users → Active
    await admin
      .from("app_users")
      .update({ status: "Active" })
      .eq("account_id", acctId)
      .eq("email", email);

    // Update invite status → Accepted (or keep it if you want)
    if (currentStatus !== "Accepted") {
      await admin
        .from("org_invites")
        .update({ status: "Accepted" })
        .eq("id", invite.id);
    }

    return json(200, { ok: true, accepted: true, email, role });
  } catch (e: any) {
    return json(500, { error: e?.message || "Server error." });
  }
});
