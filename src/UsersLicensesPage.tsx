import React, { useEffect, useState } from "react";

type DbUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  license: string;
  status: "Active" | "Invited";
  created_at?: string;
};

export default function UsersLicensesPage() {
  const [rows, setRows] = useState<DbUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // These should be set as environment variables (NOT hard-coded)
  // Vite convention: VITE_*
  const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string;
  const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string;
  const DU_ADMIN_TOKEN = (import.meta as any).env?.VITE_DU_ADMIN_TOKEN as string;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);

      try {
        if (!SUPABASE_URL) throw new Error("Missing VITE_SUPABASE_URL");
        if (!SUPABASE_ANON_KEY) throw new Error("Missing VITE_SUPABASE_ANON_KEY");
        if (!DU_ADMIN_TOKEN) throw new Error("Missing VITE_DU_ADMIN_TOKEN");

        const endpoint = `${SUPABASE_URL}/functions/v1/admin-users`;

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Supabase functions often expect apikey header
            apikey: SUPABASE_ANON_KEY,
            // verify_jwt=false means this doesn't need to be a real user JWT,
            // but keeping apikey is fine for platform routing
            "x-admin-token": DU_ADMIN_TOKEN,
          },
          body: JSON.stringify({
            action: "list",
            account_name: "Decks Unique",
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const msg =
            data?.error ||
            data?.message ||
            `Request failed (${res.status})`;
          throw new Error(msg);
        }

        const users = (data?.users || []) as DbUser[];
        if (!cancelled) setRows(users);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || "Failed to load users.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [SUPABASE_URL, SUPABASE_ANON_KEY, DU_ADMIN_TOKEN]);

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Admin Console</div>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -0.3 }}>
            Users &amp; Licenses
          </div>
          <div style={{ marginTop: 8, opacity: 0.85, maxWidth: 720 }}>
            Manage users, roles, and license seats for this account. (Data is live from Supabase.)
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button disabled style={btn("primary")} title="Next: wire create/update/delete to the Edge Function">
            + Invite User
          </button>
          <button disabled style={btn("ghost")} title="Later: plans + billing">
            View Plans
          </button>
        </div>
      </div>

      {/* Hero */}
      <div style={heroCard}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <div style={pill("gold")}>ADMIN CONSOLE</div>
          <div style={pill("slate")}>Supabase-backed</div>
          <div style={pill("green")}>Investor-Ready UI</div>
        </div>

        <div style={{ marginTop: 14, fontSize: 16, opacity: 0.92 }}>
          This page is wired to Supabase tables <b>accounts</b> + <b>app_users</b>. Next steps: auth-based
          account_id, invites, seat limits, and billing.
        </div>

        <div
          style={{
            marginTop: 16,
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          <Kpi title="Active Seats" value={loading ? "…" : String(rows.filter(r => r.status === "Active").length)} sub="Users with Active status" />
          <Kpi title="Pending Invites" value={loading ? "…" : String(rows.filter(r => r.status === "Invited").length)} sub="Users with Invited status" />
          <Kpi title="Licenses" value="—" sub="Coming soon" />
          <Kpi title="Role Health" value="Locked" sub="Admin gates enforced" />
        </div>
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 14, marginTop: 14 }}>
        {/* Users */}
        <div style={card}>
          <div style={cardHeader}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Users</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                Account: <b>Decks Unique</b>
              </div>
            </div>
            <div style={searchFake}>
              <span style={{ opacity: 0.65 }}>Search…</span>
            </div>
          </div>

          {loadError && (
            <div style={{ ...principle, borderColor: "rgba(255,80,80,0.35)" }}>
              Error: {loadError}
            </div>
          )}

          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Name</th>
                  <th style={th}>Email</th>
                  <th style={th}>Role</th>
                  <th style={th}>License</th>
                  <th style={th}>Status</th>
                  <th style={{ ...th, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <Row
                    key={u.id}
                    name={u.name}
                    email={u.email}
                    role={u.role}
                    license={u.license}
                    status={u.status}
                    accent={u.role === "admin" ? "green" : "slate"}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 12, opacity: 0.75, fontSize: 12 }}>
            Next: enable “Manage” actions (create/update/delete) via the same Edge Function.
          </div>
        </div>

        {/* Roadmap */}
        <div style={card}>
          <div style={cardHeader}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Roadmap</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>What this page will control</div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <RoadmapItem title="Invite users by email" desc="Send magic-link login and create their profile." done={false} />
            <RoadmapItem title="Assign roles (admin/user)" desc="Owner can promote/demote safely." done={false} />
            <RoadmapItem title="License & seat limits" desc="Control how many active users are allowed." done={false} />
            <RoadmapItem title="Audit & activity log" desc="Track estimates created, proposals sent/opened." done={false} />
            <RoadmapItem title="Billing integration" desc="Stripe subscriptions and renewals." done={false} />
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>Admin Principles</div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={principle}>Users can view pricing but never edit.</div>
              <div style={principle}>Admin-only controls are invisible to non-admins.</div>
              <div style={principle}>One “role source of truth” drives all permissions.</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, opacity: 0.7, fontSize: 12 }}>
        Tip: Don’t ship VITE_DU_ADMIN_TOKEN long-term. Next step is real Supabase Auth + RLS so admins don’t need a shared token.
      </div>
    </div>
  );
}

/* -------------------- UI helpers -------------------- */

function Kpi({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div style={kpiCard}>
      <div style={{ fontSize: 12, opacity: 0.75 }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 950, marginTop: 8 }}>{value}</div>
      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function RoadmapItem({ title, desc, done }: { title: string; desc: string; done: boolean }) {
  return (
    <div style={roadmapItem}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={dot(done ? "green" : "slate")} />
        <div style={{ fontWeight: 850 }}>{title}</div>
      </div>
      <div style={{ marginTop: 6, opacity: 0.8, fontSize: 12 }}>{desc}</div>
    </div>
  );
}

function Row({
  name,
  email,
  role,
  license,
  status,
  accent,
}: {
  name: string;
  email: string;
  role: string;
  license: string;
  status: string;
  accent: "green" | "gold" | "slate";
}) {
  return (
    <tr>
      <td style={td}><div style={{ fontWeight: 800 }}>{name}</div></td>
      <td style={td}>{email}</td>
      <td style={td}><span style={pill(accent)}>{role}</span></td>
      <td style={td}>{license}</td>
      <td style={td}>
        <span style={pill(status === "Active" ? "green" : "gold")}>{status}</span>
      </td>
      <td style={{ ...td, textAlign: "right" }}>
        <button disabled style={miniBtn} title="Coming soon">Manage</button>
      </td>
    </tr>
  );
}

function btn(kind: "primary" | "ghost"): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    fontWeight: 900,
    cursor: "not-allowed",
    opacity: 0.6,
    color: "#111",
    background: "rgba(255,255,255,0.65)",
  };
  if (kind === "primary") return { ...base, background: "rgba(255,255,255,0.85)" };
  return base;
}

const heroCard: React.CSSProperties = {
  borderRadius: 18,
  padding: 16,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.70)",
  boxShadow: "0 12px 30px rgba(0,0,0,0.10)",
};

const card: React.CSSProperties = {
  borderRadius: 18,
  padding: 14,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.70)",
  boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
};

const cardHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
};

const kpiCard: React.CSSProperties = {
  borderRadius: 16,
  padding: 14,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(0,0,0,0.04)",
};

const roadmapItem: React.CSSProperties = {
  borderRadius: 14,
  padding: 12,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(0,0,0,0.03)",
};

const principle: React.CSSProperties = {
  borderRadius: 14,
  padding: "10px 12px",
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(0,0,0,0.03)",
  fontSize: 12,
  fontWeight: 700,
  opacity: 0.9,
};

const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 760 };
const th: React.CSSProperties = { textAlign: "left", fontSize: 12, opacity: 0.75, padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.08)" };
const td: React.CSSProperties = { padding: "12px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)", verticalAlign: "middle" };
const searchFake: React.CSSProperties = { padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.10)", background: "rgba(0,0,0,0.04)", minWidth: 220 };

const miniBtn: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(0,0,0,0.03)",
  color: "#111",
  fontWeight: 900,
  opacity: 0.5,
  cursor: "not-allowed",
};

function pill(kind: "green" | "gold" | "slate"): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.2,
    border: "1px solid rgba(0,0,0,0.10)",
  };
  if (kind === "green") return { ...base, background: "rgba(38, 203, 124, 0.20)" };
  if (kind === "gold") return { ...base, background: "rgba(255, 204, 0, 0.22)" };
  return { ...base, background: "rgba(0,0,0,0.05)" };
}

function dot(kind: "green" | "slate"): React.CSSProperties {
  return {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: kind === "green" ? "rgba(38, 203, 124, 0.95)" : "rgba(0,0,0,0.25)",
    boxShadow: "0 0 0 4px rgba(0,0,0,0.04)",
  };
}
