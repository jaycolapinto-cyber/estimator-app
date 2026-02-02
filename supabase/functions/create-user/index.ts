// supabase/functions/create-user/index.ts
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
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeEmail(v: string) {
  return String(v || "").trim().toLowerCase();
}

function isMissingOrgIdColumn(errMsg: string) {
  const msg = (errMsg || "").toLowerCase();
  return (
    msg.includes("column") &&
    msg.includes("org_id") &&
    (msg.includes("does not exist") || msg.includes("not found"))
  );
}

async function requireAdminForOrg(params: {
  admin: any;
  account_id: string;
  caller_id: string;
}) {
  const { admin, account_id, caller_id } = params;

  // Try org_id first
  const q1 = await admin
    .from("org_members")
    .select("role")
    .eq("user_id", caller_id)
    // @ts-ignore
    .eq("org_id", account_id)
    .maybeSingle();

  if (!q1.error) {
    if ((q1.data?.role || "").toLowerCase() !== "admin") {
      throw new Error("Admin access required");
    }
    return;
  }

  // If org_id column doesn't exist, fallback to account_id
  if (!isMissingOrgIdColumn(q1.error.message)) {
    throw new Error(q1.error.message);
  }

  const q2 = await admin
    .from("org_members")
    .select("role")
    .eq("user_id", caller_id)
    // @ts-ignore
    .eq("account_id", account_id)
    .maybeSingle();

  if (q2.error) throw new Error(q2.error.message);

  if ((q2.data?.role || "").toLowerCase() !== "admin") {
    throw new Error("Admin access required");
  }
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl) return json(500, { error: "SUPABASE_URL missing" });
    if (!anonKey) return json(500, { error: "SUPABASE_ANON_KEY missing" });
    if (!serviceKey) return json(500, { error: "SUPABASE_SERVICE_ROLE_KEY missing" });

    // Must have a logged-in caller
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json(401, { error: "Missing bearer token" });

    // Identify caller (anon client with user's JWT)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user: caller },
      error: callerErr,
    } = await userClient.auth.getUser();

    if (callerErr || !caller) return json(401, { error: "Invalid session" });

    const body = await req.json();

    const name = String(body?.name || "").trim();
    const email = normalizeEmail(body?.email || "");
    const password = String(body?.password || "");
    const role: "admin" | "user" =
      String(body?.role || "user").toLowerCase() === "admin" ? "admin" : "user";
    const account_id = String(body?.account_id || "").trim();

    if (!account_id) return json(400, { error: "Missing account_id" });
    if (!email) return json(400, { error: "Missing email" });
    if (!password || password.length < 6) {
      return json(400, { error: "Password must be at least 6 characters" });
    }

    // Service role client
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify caller is admin of the org
    try {
      await requireAdminForOrg({ admin, account_id, caller_id: caller.id });
    } catch (e: any) {
      const msg = e?.message || "Admin access required";
      return json(msg === "Admin access required" ? 403 : 500, { error: msg });
    }

    // If email already exists in app_users for this account, don't reuse
    const { data: existingAppUser, error: existingAppUserErr } = await admin
      .from("app_users")
      .select("id, status")
      .eq("account_id", account_id)
      .eq("email", email)
      .maybeSingle();

    if (existingAppUserErr) return json(500, { error: existingAppUserErr.message });

    if (existingAppUser?.id) {
      return json(400, {
        error:
          "A user with this email already exists in this account. Use Reactivate (next step) or choose a different email.",
      });
    }

    // Create Auth user
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: name ? { name } : {},
    });

    if (createErr || !created?.user) {
      return json(400, { error: createErr?.message || "Failed to create auth user" });
    }

    const newUserId = created.user.id;

    // Upsert app_users
    const { error: appUserErr } = await admin.from("app_users").upsert(
      {
        id: newUserId,
        account_id,
        name: name || null,
        email,
        role,
        license: "Seat",
        status: "Active",
      },
      { onConflict: "id" }
    );
    if (appUserErr) return json(500, { error: appUserErr.message });

    // Upsert org_members using UNIQUE(user_id)
    // 1) Try update first (if this user already has an org_members row)
const { data: updatedRows, error: updErr } = await admin
  .from("org_members")
  .update({ org_id: account_id, role })
  .eq("user_id", newUserId)
  .select("user_id");

if (updErr) return json(500, { error: updErr.message });

// If updated, we're done
if (updatedRows && updatedRows.length > 0) {
  return json(200, { ok: true, id: newUserId, note: "member updated" });
}

// 2) Otherwise insert a new org_members row
const { error: insErr } = await admin.from("org_members").insert({
  org_id: account_id,
  user_id: newUserId,
  role,
});

if (insErr) return json(500, { error: insErr.message });

    if (memberUpsertErr) return json(500, { error: memberUpsertErr.message });

    return json(200, { ok: true, id: newUserId });
  } catch (e: any) {
    return json(500, { error: e?.message || "Unknown error" });
  }
});
