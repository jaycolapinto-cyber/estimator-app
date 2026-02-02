// supabase/functions/admin-users/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Action = "list" | "update" | "deactivate";

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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v || ""
  );
}

function normalizeEmail(v: string) {
  return String(v || "").trim().toLowerCase();
}

/**
 * org_members may use either org_id OR account_id depending on your schema.
 * These helpers try org_id first, then fall back to account_id if org_id column doesn't exist.
 */
function isMissingColumnOrgId(errMsg: string) {
  const msg = (errMsg || "").toLowerCase();
  return (
    msg.includes("column") &&
    msg.includes("org_id") &&
    (msg.includes("does not exist") || msg.includes("not found"))
  );
}

async function getMemberRoleForOrg(params: {
  admin: any;
  callerId: string;
  acctId: string;
}): Promise<string | null> {
  const { admin, callerId, acctId } = params;

  const q1 = await admin
    .from("org_members")
    .select("role")
    .eq("user_id", callerId)
    // @ts-ignore
    .eq("org_id", acctId)
    .maybeSingle();

  if (!q1.error) return (q1.data?.role as string) || null;

  if (!isMissingColumnOrgId(q1.error.message)) throw new Error(q1.error.message);

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

async function listOrgMembers(params: {
  admin: any;
  acctId: string;
}): Promise<Array<{ user_id: string; role: string }>> {
  const { admin, acctId } = params;

  const m1 = await admin
    .from("org_members")
    .select("user_id, role")
    // @ts-ignore
    .eq("org_id", acctId);

  if (!m1.error) return (m1.data || []) as any[];

  if (!isMissingColumnOrgId(m1.error.message)) throw new Error(m1.error.message);

  const m2 = await admin
    .from("org_members")
    .select("user_id, role")
    // @ts-ignore
    .eq("account_id", acctId);

  if (m2.error) throw new Error(m2.error.message);
  return (m2.data || []) as any[];
}

async function removeMemberFromOrg(params: {
  admin: any;
  acctId: string;
  userId: string;
}) {
  const { admin, acctId, userId } = params;

  const d1 = await admin
    .from("org_members")
    .delete()
    .eq("user_id", userId)
    // @ts-ignore
    .eq("org_id", acctId);

  if (!d1.error) return;

  if (!isMissingColumnOrgId(d1.error.message)) throw new Error(d1.error.message);

  const d2 = await admin
    .from("org_members")
    .delete()
    .eq("user_id", userId)
    // @ts-ignore
    .eq("account_id", acctId);

  if (d2.error) throw new Error(d2.error.message);
}

async function updateMemberRole(params: {
  admin: any;
  acctId: string;
  userId: string;
  nextRole: "admin" | "user";
}) {
  const { admin, acctId, userId, nextRole } = params;

  const try1 = await admin
    .from("org_members")
    .update({ role: nextRole })
    .eq("user_id", userId)
    // @ts-ignore
    .eq("org_id", acctId);

  if (!try1.error) return;

  if (!isMissingColumnOrgId(try1.error.message)) throw new Error(try1.error.message);

  const try2 = await admin
    .from("org_members")
    .update({ role: nextRole })
    .eq("user_id", userId)
    // @ts-ignore
    .eq("account_id", acctId);

  if (try2.error) throw new Error(try2.error.message);
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed. Use POST." });
  }

  try {
    // Require Authorization Bearer token (real app call)
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(401, { error: "Missing Authorization header" });
    }
    const accessToken = authHeader.replace("Bearer ", "").trim();

    // Body
    let payload: any = null;
    try {
      payload = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body." });
    }

    const action: Action = payload?.action;
    const acctId = String(payload?.account_id || payload?.org_id || "");
    if (!isUuid(acctId)) {
      return json(400, { error: "Missing/invalid account_id (or org_id)." });
    }

    // Admin client (service role)
    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url) return json(500, { error: "SUPABASE_URL missing." });
    if (!serviceKey) return json(500, { error: "SUPABASE_SERVICE_ROLE_KEY missing." });

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Identify caller (validate access token)
    const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);
    if (userErr || !userData?.user) return json(401, { error: "Invalid user session" });

    const callerId = userData.user.id;

    // Enforce caller is admin in this org
    const callerRole = await getMemberRoleForOrg({ admin, callerId, acctId });
    if (!callerRole || String(callerRole).toLowerCase() !== "admin") {
      return json(403, { error: "Not authorized" });
    }

    // -------------------------
    // ACTION: list
    // -------------------------
    if (action === "list") {
      const members = await listOrgMembers({ admin, acctId });
      const memberIds = members.map((m) => m.user_id);

      // Pull auth user info (email + name metadata)
      const authUsers: Array<{ id: string; email?: string; user_metadata?: any }> = [];
      for (const id of memberIds) {
        const u = await admin.auth.admin.getUserById(id);
        if (u?.data?.user) authUsers.push(u.data.user as any);
      }

      // Pull app_users (includes Inactive + Invited rows even if not in org_members)
      const appUsersRes = await admin
        .from("app_users")
        .select("id, user_id, name, email, role, license, status, created_at, account_id")
        .eq("account_id", acctId);

      const appUsers = (appUsersRes.error ? [] : appUsersRes.data || []) as any[];
      const appByEmail = new Map<string, any>();
      for (const au of appUsers) appByEmail.set(normalizeEmail(au.email), au);

      // 1) Active members (in org_members)
      const users: any[] = members.map((m) => {
        const authU = authUsers.find((u) => u.id === m.user_id);
        const email = normalizeEmail(authU?.email || "");
        const metaName = String(
          authU?.user_metadata?.full_name || authU?.user_metadata?.name || ""
        ).trim();

        const au = appByEmail.get(email);

        return {
          id: m.user_id,
          user_id: m.user_id,
          name: String(au?.name || metaName || email.split("@")[0] || "").trim(),
          email,
          role: String(m.role || "").toLowerCase() === "admin" ? "admin" : "user",
          license: String(au?.license || "Seat"),
          status: au?.status === "Invited" ? "Invited" : "Active",
          created_at: au?.created_at || null,
        };
      });

      // 2) Add any app_users rows not already included (Invited, Inactive, etc.)
      const existingEmails = new Set(users.map((u) => normalizeEmail(u.email)));
      for (const au of appUsers) {
        const email = normalizeEmail(au.email);
        if (!email) continue;
        if (existingEmails.has(email)) continue;

        users.push({
          id: String(au.user_id || au.id || `app:${email}`),
          user_id: String(au.user_id || ""),
          name: String(au.name || email.split("@")[0] || "").trim(),
          email,
          role: String(au.role || "user").toLowerCase() === "admin" ? "admin" : "user",
          license: String(au.license || "Seat"),
          status: String(au.status || "Active"),
          created_at: au.created_at || null,
        });
      }

      // newest first (if created_at present)
      users.sort((a: any, b: any) => {
        const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });

      return json(200, { ok: true, users });
    }

    // -------------------------
    // ACTION: update (role)
    // -------------------------
    if (action === "update") {
      const userId = String(payload?.id || payload?.user_id || "");
      if (!isUuid(userId)) {
        return json(400, { error: "Valid id (uuid) is required for update." });
      }

      const nextRole: "admin" | "user" = payload?.patch?.role === "admin" ? "admin" : "user";

      // Update org_members role
      await updateMemberRole({ admin, acctId, userId, nextRole });

      // Mirror role into app_users (prefer by user_id, fallback to email)
      const { data: au1, error: auErr } = await admin
        .from("app_users")
        .update({ role: nextRole })
        .eq("account_id", acctId)
        .eq("user_id", userId)
        .select("user_id")
        .maybeSingle();

      if (auErr) return json(500, { error: auErr.message });

      if (!au1) {
        const u = await admin.auth.admin.getUserById(userId);
        const email = normalizeEmail(u?.data?.user?.email || "");
        if (email) {
          const { error: auErr2 } = await admin
            .from("app_users")
            .update({ role: nextRole })
            .eq("account_id", acctId)
            .eq("email", email);
          if (auErr2) return json(500, { error: auErr2.message });
        }
      }

      return json(200, { ok: true });
    }

    // -------------------------
    // ACTION: deactivate
    // -------------------------
    if (action === "deactivate") {
      const userId = String(payload?.id || payload?.user_id || "");
      if (!isUuid(userId)) {
        return json(400, { error: "Valid id (uuid) is required for deactivate." });
      }

      // 1) Revoke access (remove from org_members)
      await removeMemberFromOrg({ admin, acctId, userId });

      // 2) Set app_users.status = "Inactive" (prefer by user_id, fallback to email)
      const { data, error } = await admin
        .from("app_users")
        .update({ status: "Inactive" })
        .eq("account_id", acctId)
        .eq("user_id", userId)
        .select("user_id,status")
        .maybeSingle();

      if (error) return json(500, { error: error.message });

      if (!data) {
        const u = await admin.auth.admin.getUserById(userId);
        const email = normalizeEmail(u?.data?.user?.email || "");
        if (email) {
          const { error: e2 } = await admin
            .from("app_users")
            .update({ status: "Inactive" })
            .eq("account_id", acctId)
            .eq("email", email);
          if (e2) return json(500, { error: e2.message });
        }
      }

      return json(200, { ok: true });
    }

    return json(400, {
      error: "Unsupported action",
      received_action: action,
      received_keys: Object.keys(payload || {}),
    });
  } catch (e: any) {
    return json(500, { error: e?.message || "Server error." });
  }
});
