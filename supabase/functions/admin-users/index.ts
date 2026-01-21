// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Action = "list" | "create" | "update" | "delete";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-admin-token, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

function normalizeEmail(email: string) {
  return (email || "").trim().toLowerCase();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v || ""
  );
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return json(200, { ok: true });

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed. Use POST." });
  }

  // ----- Admin token gate -----
  const expectedToken = Deno.env.get("DU_ADMIN_TOKEN") || "";
  const gotToken =
    req.headers.get("x-admin-token") ||
    req.headers.get("X-Admin-Token") ||
    "";

  if (!expectedToken) {
    return json(500, { error: "Server misconfigured: DU_ADMIN_TOKEN missing." });
  }
  if (!gotToken || gotToken !== expectedToken) {
    return json(401, { error: "Unauthorized (missing/invalid admin token)." });
  }

  // ----- Service role client (server-only) -----
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";


  if (!url) return json(500, { error: "Server misconfigured: SUPABASE_URL missing." });
  if (!serviceKey) {
  return json(500, {
    error: "Server misconfigured: SUPABASE_SERVICE_ROLE_KEY missing.",
  });
}


  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ----- Parse input -----
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const action: Action = payload?.action;

  // We will support using account_id OR account_name (temporary convenience)
  const account_id: string | undefined = payload?.account_id;
  const account_name: string | undefined = payload?.account_name;

  async function resolveAccountId(): Promise<string | null> {
    if (account_id && isUuid(account_id)) return account_id;

    if (account_name && String(account_name).trim()) {
      const acct = await admin
        .from("accounts")
        .select("id")
        .eq("name", String(account_name).trim())
        .limit(1)
        .maybeSingle();

      if (acct.error) throw new Error(acct.error.message);
      if (!acct.data?.id) return null;
      return acct.data.id as string;
    }

    return null;
  }

  try {
    // ----- ACTION: list -----
    if (action === "list") {
      const acctId = await resolveAccountId();
      if (!acctId) return json(400, { error: "Missing/invalid account_id (or account_name not found)." });

      const res = await admin
        .from("app_users")
        .select("id,name,email,role,license,status,created_at")
        .eq("account_id", acctId)
        .order("role", { ascending: true })
        .order("name", { ascending: true });

      if (res.error) return json(400, { error: res.error.message });
      return json(200, { ok: true, users: res.data || [] });
    }

    // ----- ACTION: create -----
    if (action === "create") {
      const acctId = await resolveAccountId();
      if (!acctId) return json(400, { error: "Missing/invalid account_id (or account_name not found)." });

      const name = String(payload?.user?.name || "").trim();
      const email = normalizeEmail(String(payload?.user?.email || ""));
      const role = payload?.user?.role === "admin" ? "admin" : "user";
      const license = String(payload?.user?.license || "Seat").trim() || "Seat";
      const status = payload?.user?.status === "Invited" ? "Invited" : "Active";

      if (!name) return json(400, { error: "user.name is required." });
      if (!email || !email.includes("@")) return json(400, { error: "Valid user.email is required." });

      const res = await admin
        .from("app_users")
        .insert({
          account_id: acctId,
          name,
          email,
          role,
          license,
          status,
        })
        .select("id,name,email,role,license,status,created_at")
        .single();

      if (res.error) return json(400, { error: res.error.message });
      return json(200, { ok: true, user: res.data });
    }

    // ----- ACTION: update -----
    if (action === "update") {
      const id = String(payload?.id || "");
      if (!isUuid(id)) return json(400, { error: "Valid id (uuid) is required for update." });

      // allow updating only certain fields
      const patch: any = {};
      if (payload?.patch?.name !== undefined) patch.name = String(payload.patch.name || "").trim();
      if (payload?.patch?.email !== undefined) patch.email = normalizeEmail(String(payload.patch.email || ""));
      if (payload?.patch?.role !== undefined) patch.role = payload.patch.role === "admin" ? "admin" : "user";
      if (payload?.patch?.license !== undefined) patch.license = String(payload.patch.license || "Seat").trim() || "Seat";
      if (payload?.patch?.status !== undefined) patch.status = payload.patch.status === "Invited" ? "Invited" : "Active";

      if (patch.email !== undefined && (!patch.email || !patch.email.includes("@"))) {
        return json(400, { error: "patch.email must be a valid email." });
      }
      if (patch.name !== undefined && !patch.name) {
        return json(400, { error: "patch.name cannot be empty." });
      }

      const res = await admin
        .from("app_users")
        .update(patch)
        .eq("id", id)
        .select("id,name,email,role,license,status,created_at")
        .single();

      if (res.error) return json(400, { error: res.error.message });
      return json(200, { ok: true, user: res.data });
    }

    // ----- ACTION: delete -----
    if (action === "delete") {
      const id = String(payload?.id || "");
      if (!isUuid(id)) return json(400, { error: "Valid id (uuid) is required for delete." });

      const res = await admin.from("app_users").delete().eq("id", id).select("id").single();
      if (res.error) return json(400, { error: res.error.message });

      return json(200, { ok: true, deletedId: res.data?.id || id });
    }

    return json(400, { error: "Unknown action. Use: list | create | update | delete." });
  } catch (e: any) {
    return json(500, { error: e?.message || "Server error." });
  }
});
