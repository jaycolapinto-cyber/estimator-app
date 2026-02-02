import React, { useState } from "react";
import { supabase } from "./supabaseClient";

export default function CreateOrgPage({ onCreated }: { onCreated: (orgId: string) => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleCreate() {
    setErr(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setErr("Please enter your company / organization name.");
      return;
    }

    setSaving(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess?.session?.user?.id;
      if (!userId) throw new Error("Not logged in.");

      // 1) create org
      const { data: org, error: orgErr } = await supabase
        .from("orgs")
        .insert({ name: trimmed, owner_user_id: userId })
        .select("id")
        .single();

      if (orgErr) throw orgErr;
      const orgId = org.id as string;

      // 2) add creator as admin member
      const { error: memErr } = await supabase.from("org_members").insert({
        org_id: orgId,
        user_id: userId,
        role: "admin",
      });

      if (memErr) throw memErr;

      onCreated(orgId);
    } catch (e: any) {
      setErr(e?.message || "Failed to create organization.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 22, maxWidth: 720 }}>
      <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>WELCOME</div>
      <div style={{ fontSize: 32, fontWeight: 900, marginTop: 6 }}>Create your Organization</div>
      <div style={{ marginTop: 10, opacity: 0.8 }}>
        You’re the first admin. You’ll be able to invite your team after this.
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7, marginBottom: 6 }}>
          Company / Org Name
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Decks Unique"
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.15)",
            fontSize: 16,
            fontWeight: 700,
          }}
        />
      </div>

      {err && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 12,
            background: "rgba(255,80,80,0.10)",
            border: "1px solid rgba(255,80,80,0.25)",
            color: "#7a1b1b",
            fontWeight: 900,
            fontSize: 12,
          }}
        >
          {err}
        </div>
      )}

      <button
        onClick={handleCreate}
        disabled={saving}
        style={{
          marginTop: 16,
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.12)",
          background: "#111",
          color: "white",
          fontWeight: 900,
          cursor: saving ? "not-allowed" : "pointer",
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? "Creating..." : "Create Organization"}
      </button>
    </div>
  );
}
