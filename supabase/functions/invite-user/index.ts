// supabase/functions/invite-user/index.ts
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

function normalizeEmail(email: string) {
  return (email || "").trim().toLowerCase();
}

async function getMemberRoleForOrg(params: { admin: any; callerId: string; acctId: string }) {
  const { admin, callerId, acctId } = params;

  // Try org_id first
  const q1 = await admin
    .from("org_members")
    .select("role")
    .eq("user_id", callerId)
    // @ts-ignore
    .eq("org_id", acctId)
    .maybeSingle();

  if (!q1.error) return (q1.data?.role as string) || null;

  // If org_id column doesn't exist, try account_id
  const msg = (q1.error?.message || "").toLowerCase();
  const missingOrgIdColumn =
    msg.includes("column") &&
    msg.includes("org_id") &&
    (msg.includes("does not exist") || msg.includes("not found"));

  if (!missingOrgIdColumn) throw new Error(q1.error.message);

  const q2 = await admin
    .from("org_members")
    .select("role")
    .eq("user_id", callerId)
    // @ts-ignore
    .eq("account_id", acctId)
    .maybeSingle();

  if (q2.error) throw new Error(q2.error.message);
  return (q2.data?.role as string) || null;
}

/**
 * app_users sometimes uses account_id, sometimes org_id.
 * We detect which one exists by trying a harmless select and looking for "column does not exist".
 */
async function detectAppUsersOrgKey(admin: any): Promise<"account_id" | "org_id"> {
  const t1 = await admin.from("app_users").select("account_id").limit(1);
  if (!t1.error) return "account_id";

  const msg = (t1.error?.message || "").toLowerCase();
  const missingAccountId =
    msg.includes("column") &&
    msg.includes("account_id") &&
    (msg.includes("does not exist") || msg.includes("not found"));

  if (missingAccountId) return "org_id";

  // Unknown error: bubble up
  throw new Error(t1.error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed. Use POST." });

  const authHeader = req.headers.get("authorization") || "";

const roleHeader = (req.headers.get("x-supabase-role") || "").toLowerCase();

// Dashboard Test w/ "Role: service role" sets this header
const isServiceRoleCall = roleHeader === "service_role";

const accessToken = authHeader.startsWith("Bearer ")
  ? authHeader.replace("Bearer ", "").trim()
  : "";

// Only require a Bearer token for NON-service-role calls
if (!isServiceRoleCall && !accessToken) {
  return json(401, { error: "Invalid user session" });
}

    let payload: any;
    try {
      payload = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body." });
    }

    const acctId = String(payload?.account_id || payload?.org_id || "");
    if (!isUuid(acctId)) return json(400, { error: "Missing/invalid account_id (or org_id)." });

    const email = normalizeEmail(String(payload?.email || ""));
    const role = payload?.role === "admin" ? "admin" : "user";

    if (!email || !email.includes("@")) return json(400, { error: "Valid email is required." });

    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const inviteRedirectTo =
  Deno.env.get("INVITE_REDIRECT_TO") ||
  `${url.replace(/\/$/, "")}/auth/v1/verify`;

    if (!url) return json(500, { error: "SUPABASE_URL missing." });
    if (!serviceKey) return json(500, { error: "SUPABASE_SERVICE_ROLE_KEY missing." });

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

  let callerId: string | null = null;

// Identify caller (only when NOT service_role test)
if (!isServiceRoleCall) {
  const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);
  if (userErr || !userData?.user) return json(401, { error: "Invalid user session" });

  callerId = userData.user.id;

  // Must be admin of this org
  const callerRole = await getMemberRoleForOrg({ admin, callerId, acctId });
  if (!callerRole || String(callerRole).toLowerCase() !== "admin") {
    return json(403, { error: "Not authorized" });
  }
}

// ✅ invited_by must be UUID or NULL
const invitedBy = isServiceRoleCall ? null : callerId;

// ✅ Create/refresh a real Supabase Auth invite email
// This sends the email invite (SMTP optional; Supabase can still send depending on plan/config)
const { data: inviteAuth, error: inviteAuthErr } =
  await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: inviteRedirectTo,
    data: {
      account_id: acctId,
      role,
     invited_by: invitedBy,
    },
  });

if (inviteAuthErr) {
  return json(400, { error: inviteAuthErr.message || "Failed to create auth invite" });
}

    // ✅ detect whether app_users uses account_id or org_id
    const orgKey = await detectAppUsersOrgKey(admin);

    // ✅ find existing invited/user row
    const existing = await admin
      .from("app_users")
      .select("id,email")
      .eq(orgKey, acctId)
      .eq("email", email)
      .maybeSingle();

    if (existing.error) return json(400, { error: existing.error.message });

    const patch = {
      [orgKey]: acctId,
      email,
      name: email.split("@")[0],
      role,
      license: "Seat",
      status: "Invited",
    } as any;
    // ✅ Also write to org_invites so the UI can count "Invited"
    // (org_invites uses account_id, so we always use acctId here)
    const inv = await admin
      .from("org_invites")
      .insert({
        account_id: acctId,
        email,
        role,
        status: "Invited",
       invited_by: invitedBy,
      });

    // If it's a duplicate pending invite, we can just "refresh" it
    if (inv.error) {
      const msg = (inv.error.message || "").toLowerCase();

      // duplicate / unique violation
      if (msg.includes("duplicate") || msg.includes("unique")) {
        const upd = await admin
          .from("org_invites")
          .update({
            role,
            status: "Invited",
            invited_by: invitedBy,
            created_at: new Date().toISOString(),
          })
          .eq("account_id", acctId)
          .eq("email", email);

        if (upd.error) return json(400, { error: upd.error.message });
      } else {
        return json(400, { error: inv.error.message });
      }
    }

    // If exists -> update, else -> insert
    if (existing.data?.id) {
      const up = await admin
        .from("app_users")
        .update(patch)
        .eq("id", existing.data.id)
        .select("id,name,email,role,license,status,created_at")
        .single();

      if (up.error) return json(400, { error: up.error.message });
      return json(200, { ok: true, user: up.data });
    } else {
      const ins = await admin
        .from("app_users")
        .insert(patch)
        .select("id,name,email,role,license,status,created_at")
        .single();

      if (ins.error) return json(400, { error: ins.error.message });
      return json(200, { ok: true, user: ins.data });
    }
  } catch (e: any) {
    return json(500, { error: e?.message || "Server error." });
  }
});
