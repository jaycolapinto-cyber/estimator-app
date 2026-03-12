// App.tsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { fetchProposalSections } from "./proposalSections"; // <-- add this import near the top
import PricingAdmin from "./PricingAdmin";
import ProposalPage from "./ProposalPage";
import SettingsPage from "./SettingsPage";
import "./styles.css";
import { supabase } from "./supabaseClient";
import AnalyticsPage from "./AnalyticsPage";
import ReviewProposalPage from "./ReviewProposalPage";
import { uid } from "./utils/uid";
import UsersLicensesPage from "./UsersLicensesPage";
import AuthPage from "./AuthPage";
import CreateOrgPage from "./CreateOrgPage";
import ContractPage from "./ContractPage";
import AccessRevoked from "./AccessRevoked";
function BootScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(180deg, #f3f4f6 0%, #eef2ff 100%)",
        fontFamily: "system-ui",
      }}
    >
      <div
        style={{
          width: 420,
          maxWidth: "92vw",
          padding: 22,
          borderRadius: 16,
          background: "white",
          border: "1px solid rgba(0,0,0,0.10)",
          boxShadow: "0 18px 45px rgba(0,0,0,0.12)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#111",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              letterSpacing: 0.5,
            }}
          >
            DU
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 900 }}>Deck Estimator</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Decks Unique</div>
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: 999,
              border: "3px solid rgba(0,0,0,0.12)",
              borderTopColor: "rgba(0,0,0,0.65)",
              animation: "duSpin 0.9s linear infinite",
            }}
          />
          <div style={{ fontWeight: 800, opacity: 0.8 }}>{label}</div>
        </div>

        <style>
          {`@keyframes duSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
        </style>
      </div>
    </div>
  );
}

const EXPRESSION_ALLOWED = /^[0-9+\-*/().\s]+$/;

function parseExpression(input: string): number | null {
  let raw = (input || "").trim();
  if (!raw) return null;
  if (raw.startsWith("=")) raw = raw.slice(1).trim();
  if (!raw) return null;
  if (!EXPRESSION_ALLOWED.test(raw)) return null;
  try {
    const result = Function(`"use strict"; return (${raw});`)();
    if (typeof result !== "number" || !Number.isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

function ExpressionNumberInput({
  value,
  onValueChange,
  placeholder,
  className,
  ariaLabel,
  readOnly,
}: {
  value: number;
  onValueChange: (value: number) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  readOnly?: boolean;
}) {
  const [text, setText] = useState(value === 0 ? "" : String(value));
  const isEditing = useRef(false);

  useEffect(() => {
    if (!isEditing.current) {
      setText(value === 0 ? "" : String(value));
    }
  }, [value]);

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === "") {
      onValueChange(0);
      setText("");
      return;
    }
    const parsed = parseExpression(trimmed);
    if (parsed !== null) {
      onValueChange(parsed);
      setText(parsed === 0 ? "" : String(parsed));
    } else {
      setText(value === 0 ? "" : String(value));
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      pattern="[0-9+\-*/().=\s]*"
      className={className}
      placeholder={placeholder}
      value={text}
      readOnly={readOnly}
      aria-label={ariaLabel}
      onFocus={() => {
        isEditing.current = true;
      }}
      onBlur={() => {
        isEditing.current = false;
        commit();
      }}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
    />
  );
}

// ================================
// ADD ITEM – CATEGORY MASTER LIST
type AddItemRow = {
  rowId: string;
  category: string; // Supabase category name (or "Misc")
  itemId: string; // Supabase item id (blank for Misc)
  qty: number;
  // ✅ Bench subtype (Add Items)
  benchType?: string; // "12_flat" | "12_back" | "12_storage" | "18_flat" | "18_back" | "18_storage"

  // 🆕 Construction Options (Add Items only)
  constructionType?: string;
  deckingId?: string;

  // ✅ Misc / custom user item
  customName?: string;
  customQtyText?: string;

  customDescription?: string;

  customPrice?: number;
  isFixedPrice?: boolean;
};

// ------------------------------
// TYPES
// ------------------------------
export type PricingItemRow = {
  id: number | string;

  category: string | null;
  category2?: string | null;
  category_id?: number | null;

  name: string;
  display_name?: string | null;

  cost: number;
  unit: string | null;
  base_unit?: string | null;

  group: string | null;
  sort_order: number | null;
  active: boolean;
  proposal_description?: string | null;
  deleted_at?: string | null;

  subcategory_id?: number | null;
  option_group_id?: number | null;
};

type PricingCategoryRow = {
  id: number;
  name: string;
  is_active: boolean;
};

// ------------------------------
// PERMIT UPLIFT HELPER
// ------------------------------
function getPermitTierForTotal(
  rows: PricingItemRow[],
  deckTotal: number
): { multiplier: number; threshold: number | null } {
  if (!deckTotal || !Number.isFinite(deckTotal))
    return { multiplier: 1, threshold: null };

  const permitRows = rows.filter(
    (row) =>
      (row.unit || "").toLowerCase().trim() === "global_multiplier" &&
      (row.name || "").toLowerCase().includes("permit deck")
  );

  if (!permitRows.length) return { multiplier: 1, threshold: null };

  let chosenThreshold: number | null = null;
  let chosenMultiplier = 1;

  for (const row of permitRows) {
    const match = (row.name || "").match(/less than\s+(\d+)(k?)/i);
    if (!match) continue;

    const num = Number(match[1]);
    const hasK = !!match[2];
    const threshold = hasK ? num * 1000 : num;
    const multiplier = row.cost ?? 1;

    if (deckTotal <= threshold) {
      if (chosenThreshold === null || threshold < chosenThreshold) {
        chosenThreshold = threshold;
        chosenMultiplier = multiplier;
      }
    }
  }

  return { multiplier: chosenMultiplier, threshold: chosenThreshold };
}

// ------------------------------
// SMALL JOB UPLIFT HELPER
// ------------------------------
function getSmallJobTierForTotal(
  rows: PricingItemRow[],
  deckTotal: number
): { multiplier: number; threshold: number | null } {
  if (!deckTotal || !Number.isFinite(deckTotal))
    return { multiplier: 1, threshold: null };

  const smallRows = rows.filter((row) => {
    const unit = (row.unit || "").toLowerCase().trim();
    const name = (row.name || "").toLowerCase();
    return unit === "global_multiplier" && name.includes("deck less than");
  });

  if (!smallRows.length) return { multiplier: 1, threshold: null };

  const parsed = smallRows
    .map((row) => {
      const match = (row.name || "").match(/less than\s+(\d+)(k?)/i);
      if (!match) return null;

      const num = Number(match[1]);
      const hasK = !!match[2];
      const threshold = hasK ? num * 1000 : num;

      if (!Number.isFinite(threshold) || threshold > 9000) return null;

      return { threshold, multiplier: row.cost ?? 1 };
    })
    .filter(Boolean) as { threshold: number; multiplier: number }[];

  if (parsed.length === 0) return { multiplier: 1, threshold: null };

  const candidates = parsed
    .filter((t) => deckTotal <= t.threshold)
    .sort((a, b) => a.threshold - b.threshold);

  if (candidates.length === 0) return { multiplier: 1, threshold: null };

  return {
    multiplier: candidates[0].multiplier,
    threshold: candidates[0].threshold,
  };
}

// ------------------------------
// CONSTRUCTION TYPE ADJUSTMENTS ($ per SF)
// ------------------------------
const CONSTRUCTION_TYPES = [
  { value: "", label: "Construction Type", adjust: 0 },
  { value: "New_Construction", label: "New Construction", adjust: 0 },
  { value: "ReSurface", label: "Resurface", adjust: -4 },
  { value: "Second_Story", label: "Second Story", adjust: 2 },
  {
    value: "Second_Story_Resurface",
    label: "Second Story Resurface",
    adjust: 0,
  },
  { value: "Sleeper_System", label: "Sleeper System", adjust: -2 },
  {
    value: "Second_Story_Sleeper_System",
    label: "Second Story Sleeper System",
    adjust: 0,
  },
];
const BENCH_TYPES = [
  { value: "12_flat", label: "12in Flat Bench" },
  { value: "12_back", label: "12in Flat Bench w back" },
  { value: "12_storage", label: "12in Flat Bench w storage" },
  { value: "18_flat", label: "18 inch Bench" },
  { value: "18_back", label: "18 inch Bench w back" },
  { value: "18_storage", label: "18 inch Bench w storage" },
] as const;

type BenchTypeValue = (typeof BENCH_TYPES)[number]["value"];

function isBenchCategory(cat: string) {
  return normalizeCat(cat || "") === "bench";
}

function getConstructionAdjustment(type: string): number {
  const found = CONSTRUCTION_TYPES.find((t) => t.value === type);
  return found?.adjust ?? 0;
}
function normalizeName(v: string) {
  return (v || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function normalizeCat(v: string) {
  return (v || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
}

function isConstructionTypeCategory(cat: string) {
  if (!cat) return false;
  const norm = normalizeCat(cat);
  return CONSTRUCTION_TYPES.some(
    (t) => t.value && normalizeCat(t.value) === norm
  );
}

function getConstructionTypeLabel(cat: string) {
  if (!cat) return "";
  const norm = normalizeCat(cat);
  const found = CONSTRUCTION_TYPES.find(
    (t) => t.value && normalizeCat(t.value) === norm
  );
  return found?.label || cat;
}

type SidebarNavItemProps = {
  label: string;
  isActive: boolean;
  onClick: () => void;
};

function SidebarNavItem({ label, isActive, onClick }: SidebarNavItemProps) {
  return (
    <button
      className={`sidebar-nav-item ${isActive ? "is-active" : ""}`}
      onClick={onClick}
      type="button"
    >
      <span className="sidebar-nav-dot" />
      <span>{label}</span>
    </button>
  );
}

// ===============================
// RECENT FILES (localStorage)
// ===============================
type RecentFile = { name: string; json: any; ts: number };
const RECENTS_KEY = "du_recent_files_v1";
const RECENTS_MAX = 8;
const PRICING_ITEMS_CACHE_KEY = "du_cache::pricing_items2_v1";
const PRICING_CATS_CACHE_KEY = "du_cache::pricing_categories_v1";
const PRICING_CACHE_TS_KEY = "du_cache::pricing_ts_v1";

function getRecents(): RecentFile[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function saveRecents(next: RecentFile[]) {
  try {
    localStorage.setItem(
      RECENTS_KEY,
      JSON.stringify(next.slice(0, RECENTS_MAX))
    );
  } catch {}
}
function pushRecent(name: string, json: any) {
  const now = Date.now();
  const prev = getRecents();
  const filtered = prev.filter((r) => r?.name !== name);
  saveRecents([{ name, json, ts: now }, ...filtered]);
}

async function saveProposal(proposalData: any, orgId: string | null) {
  // ✅ fetch snapshot at save-time so public review always has blocks
  let proposalSectionsSnapshot: any[] = [];
  try {
    if (orgId) {
      const rows = await fetchProposalSections(orgId);
      proposalSectionsSnapshot = Array.isArray(rows) ? rows : [];
    }
  } catch (e) {
    console.warn("Could not fetch proposal sections snapshot", e);
  }

  const proposalWithSnapshot = {
    ...proposalData,
    proposalSectionsSnapshot,
  };

  const { data, error } = await supabase
    .from("proposals")
    .insert([{ data: proposalWithSnapshot }])
    .select("id")
    .single();

  if (error) {
    console.error("Failed to save proposal", error);
    alert("Failed to save proposal");
    return null;
  }

  return data.id;
}

const DEPLOY_VERSION =
  (process.env.REACT_APP_COMMIT_SHA || process.env.REACT_APP_VERSION || "")
    .toString()
    .trim()
    .slice(0, 7) || "dev";

function App() {
  const path = window.location.pathname;

  // Public route: proposal review (NO hooks here)
  if (path.startsWith("/review/")) {
    return <ReviewProposalPage />;
  }

  // Everything else uses auth
  return <AuthedApp />;
}
function AuthedApp() {
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [isAdmin, setIsAdmin] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgResolved, setOrgResolved] = useState(false);
  useEffect(() => {
    if (orgId) console.log("APP_ORG_ID", orgId);
  }, [orgId]);

  const email = (session?.user?.email || "").toLowerCase();
  // ✅ Accept invite automatically once orgId is known
  const acceptedInviteRef = useRef<string>("");

  useEffect(() => {
    // only attempt once we have orgId and a signed-in user
    if (!orgId) return;
    if (!session?.user?.id) return;

    // Prevent calling repeatedly for the same org in a single session
    if (acceptedInviteRef.current === orgId) return;
    acceptedInviteRef.current = orgId;

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke(
          "accept-invite",
          {
            body: { account_id: orgId },
          }
        );

        // Not an error if they weren't invited
        if (error) {
          console.warn("accept-invite error:", error);
          return;
        }
        if ((data as any)?.error) {
          console.warn("accept-invite function error:", (data as any).error);
          return;
        }

        console.log("accept-invite result:", data);
      } catch (e) {
        console.warn("accept-invite exception:", e);
      }
    })();
  }, [orgId, session?.user?.id]);
  // 0) ✅ Finalize Supabase auth after invite/magic links (prevents blank spinning page)
  useEffect(() => {
    // Trigger Supabase to parse auth params from the URL (hash/query)
    supabase.auth.getSession().catch(() => {});

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        // Clean up the URL after auth completes
        if (window.location.hash || window.location.search) {
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );
        }
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  // 1) Auth session bootstrap
  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session ?? null);
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (cancelled) return;
        setSession(newSession ?? null);
        setAuthLoading(false);
      }
    );

    return () => {
      cancelled = true;
      listener?.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const OFFLINE_ORG_KEY = "du_offline_org_id";
    const OFFLINE_LAST_KEY = "du_last_online";

    async function loadOrgForUser() {
      // If not logged in yet, don’t resolve anything.
      if (!session?.user?.id) return;

      setOrgLoading(true);
      setOrgResolved(false);

      try {
        const userId = session.user.id;

        // 1) Try org_members.org_id first
        const q1 = await supabase
          .from("org_members")
          .select("org_id, role")
          .eq("user_id", userId)
          .maybeSingle();

        // If that worked and we have an org_id, use it
        if (!q1.error && q1.data?.org_id) {
          if (cancelled) return;
          setOrgId(q1.data.org_id);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(OFFLINE_ORG_KEY, q1.data.org_id);
            if (navigator.onLine) {
              window.localStorage.setItem(OFFLINE_LAST_KEY, String(Date.now()));
            }
          }
          console.log("APP_ORG_ID", q1.data.org_id);
          setIsAdmin(String(q1.data.role || "").toLowerCase() === "admin");
          return;
        }

        // 2) If org_id column doesn’t exist, fallback to account_id
        const msg = (q1.error?.message || "").toLowerCase();
        const missingOrgId =
          msg.includes("column") &&
          msg.includes("org_id") &&
          (msg.includes("does not exist") || msg.includes("not found"));

        if (!missingOrgId) {
          // If it’s some other error, treat as “no org” but don’t crash
          console.warn("org lookup error:", q1.error);
        }

        const q2 = await supabase
          .from("org_members")
          .select("account_id, role")
          .eq("user_id", userId)
          .maybeSingle();

        if (!q2.error && q2.data?.account_id) {
          if (cancelled) return;
          setOrgId(q2.data.account_id);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(OFFLINE_ORG_KEY, q2.data.account_id);
            if (navigator.onLine) {
              window.localStorage.setItem(OFFLINE_LAST_KEY, String(Date.now()));
            }
          }
          setIsAdmin(String(q2.data.role || "").toLowerCase() === "admin");
          return;
        }

        // No org membership found -> IMPORTANT:
        // They are NOT an admin and should NOT see CreateOrgPage.
        if (cancelled) return;
        setOrgId(null);
        setIsAdmin(false);
      } finally {
        if (cancelled) return;
        setOrgLoading(false);
        setOrgResolved(true); // ✅ this is the key fix

        if (typeof window !== "undefined" && !navigator.onLine) {
          const cached = window.localStorage.getItem(OFFLINE_ORG_KEY);
          if (cached) {
            setOrgId(cached);
          }
        }
      }
    }

    loadOrgForUser();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  // 3) Render gates (IMPORTANT ORDER)
  if (authLoading) return <BootScreen label="Checking sign-in…" />;

  if (!session) return <AuthPage />;

  if (orgLoading) return <BootScreen label="Loading your organization…" />;

  const OFFLINE_LAST_KEY = "du_last_online";
  const OFFLINE_ORG_KEY = "du_offline_org_id";
  const OFFLINE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

  if (typeof window !== "undefined" && !navigator.onLine) {
    const lastOnline = Number(window.localStorage.getItem(OFFLINE_LAST_KEY) || 0);
    if (!lastOnline || Date.now() - lastOnline > OFFLINE_GRACE_MS) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-8">
          <div className="max-w-xl rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center">
            <div className="text-xl font-semibold mb-2">Offline access expired</div>
            <p className="text-sm text-slate-300">
              Please reconnect to the internet and sign in to continue. Offline access lasts 3 days.
            </p>
            <button
              className="mt-4 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
  }

  // ✅ Guard: user has no org
  if (orgResolved && !orgId) {
    if (typeof window !== "undefined" && !navigator.onLine) {
      const cached = window.localStorage.getItem(OFFLINE_ORG_KEY);
      if (cached) {
        return (
          <AppShell
            isAdmin={false}
            orgId={cached}
            onLogout={async () => {}}
            userEmail={email}
          />
        );
      }
    }
    // Only admins are allowed to create an org
    if (isAdmin) {
      return (
        <CreateOrgPage
          onCreated={(newOrgId) => {
            setOrgId(newOrgId);
            setIsAdmin(true);
          }}
        />
      );
    }

    // Non-admins should NEVER see CreateOrgPage
    return (
      <AccessRevoked />
    );
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // ✅ Guard: only admins can create an org
  if (orgResolved && !orgId) {
    if (isAdmin) {
      return (
        <CreateOrgPage
          onCreated={(newOrgId) => {
            setOrgId(newOrgId);
            setIsAdmin(true);
          }}
        />
      );
    }

    return (
      <AccessRevoked />
    );
  }

  return (
    <AppShell
      isAdmin={isAdmin}
      orgId={orgId}
      onLogout={handleLogout}
      userEmail={email}
    />
  );
}

function AppShell({
  isAdmin,
  orgId,
  onLogout,
  userEmail,
}: {
  isAdmin: boolean;
  orgId: string | null;
  onLogout: () => void;
  userEmail: string;
}) {
  // ===============================
  // ROLE GATES (email-based for now)
  // ===============================
  const canEditPricing = isAdmin;
  const canSeeUsersLicenses = isAdmin;
  const [proposalSectionsSnapshot, setProposalSectionsSnapshot] = useState<
    any[]
  >([]);

  function BootScreen({ label = "Loading…" }: { label?: string }) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #f3f4f6 0%, #eef2ff 100%)",
          fontFamily: "system-ui",
        }}
      >
        <div
          style={{
            width: 420,
            maxWidth: "92vw",
            padding: 22,
            borderRadius: 16,
            background: "white",
            border: "1px solid rgba(0,0,0,0.10)",
            boxShadow: "0 18px 45px rgba(0,0,0,0.12)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "#111",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                letterSpacing: 0.5,
              }}
            >
              DU
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 900 }}>
                Deck Estimator
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Decks Unique</div>
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: 999,
                border: "3px solid rgba(0,0,0,0.12)",
                borderTopColor: "rgba(0,0,0,0.65)",
                animation: "duSpin 0.9s linear infinite",
              }}
            />
            <div style={{ fontWeight: 800, opacity: 0.8 }}>{label}</div>
          </div>

          <style>
            {`@keyframes duSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
          </style>
        </div>
      </div>
    );
  }

  // ===============================
  // FILE MENU + CONFIRM MODALS
  // ===============================
  const [fileOpen, setFileOpen] = useState(false);
  const [confirmNewOpen, setConfirmNewOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  type EmailDraft = {
    to: string;
    subject: string;
    body: string;
    link: string;
    proposalId?: string;
    sendMeCopy?: boolean;
  };

  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  // ===============================
  // STEP 3: SEND FROM EMAIL MODAL
  // - Always enqueue first (offline safe)
  // - If online: flush queue (sends now)
  // - Close modal + clear draft
  // ===============================
  // ===============================
  // HELPER: Convert Blob → base64 (no data: prefix)
  // ===============================
  async function blobToBase64NoPrefix(blob: Blob): Promise<string> {
    const arrayBuffer = await blob.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(arrayBuffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }
  const handleSendEmailFromModal = async () => {
    if (!emailDraft) return;
    await sendEmailNow();
  };

  const supabaseUrl = (supabase as any)?.supabaseUrl || "";

  const sendEmailNow = async () => {
    if (!emailDraft) return;

    try {
      const to = (emailDraft.to || "").trim();
      const subject = (emailDraft.subject || "").trim();
      const bodyText = emailDraft.body || "";
      const replyTo = (userSettings?.userEmail || "").trim();

      // ✅ default OFF
      const sendMeCopy = !!emailDraft?.sendMeCopy;

      // ✅ Button link (your review URL)
      const proposalLink = (emailDraft as any)?.link || "";
      const trackingId = (emailDraft as any)?.proposalId || "";
      const functionsBase = supabaseUrl.replace(
        /\.supabase\.co$/,
        ".functions.supabase.co"
      );
      const trackOpenUrl = trackingId
        ? `${functionsBase}/track-open?tid=${trackingId}`
        : "";
      const trackClickUrl =
        trackingId && proposalLink
          ? `${functionsBase}/track-click?tid=${trackingId}&url=${encodeURIComponent(
              proposalLink
            )}`
          : proposalLink;

      // ✅ Email HTML (includes a real "View Proposal" button)
      const html = `
        <div style="font-family: system-ui, -apple-system, Segoe UI, Arial, sans-serif; font-size: 14px; line-height: 1.6; color:#111;">
          <div style="white-space:pre-wrap;">${String(bodyText)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")}</div>
  
          ${
            proposalLink
              ? `
            <div style="margin-top:18px;">
              <a href="${trackClickUrl}"
                style="display:inline-block; background:#16a34a; color:#fff; text-decoration:none; padding:12px 16px; border-radius:10px; font-weight:700;">
                View Proposal
              </a>
            </div>
            <div style="margin-top:10px; font-size:12px; color:#555;">
              If the button doesn’t work, paste this link into your browser:<br/>
              <span>${proposalLink}</span>
            </div>
          `
              : ""
          }
          ${
            trackOpenUrl
              ? `<img src="${trackOpenUrl}" width="1" height="1" style="display:none" alt="" />`
              : ""
          }
        </div>
      `;

      console.log("sendEmailNow -> invoking edge function", {
        to,
        subject,
        replyTo,
        bodyLen: bodyText.length,
        htmlLen: html.length,
      });

  // ✅ get proposal id safely
const proposalId = emailDraft?.proposalId || undefined;

// ✅ get reply-to from Settings (required)

if (!replyTo) {
  alert("Missing Reply-To email. Go to Settings and set your email address.");
  return;
}

// ✅ call Edge Function
const { data, error } = await supabase.functions.invoke(
  "send-proposal-email",
  {
    body: {
      to,
      subject,
      html,
      proposalId,
      replyTo,
      text: (bodyText || "").trim() || undefined,
      cc: sendMeCopy ? [replyTo] : undefined,
    },
  }
);

if (error) {
  console.error("EDGE FUNCTION ERROR:", error);
  alert("Send failed:\n\n" + JSON.stringify(error, null, 2));
  return;
}

console.log("EDGE FUNCTION SUCCESS:", data);



      if (error) {
        console.error("EDGE FUNCTION ERROR (raw):", error);
        console.error(
          "EDGE FUNCTION ERROR (json):",
          JSON.stringify(error, null, 2)
        );

        const msg =
          (error as any)?.message ||
          (error as any)?.context?.body ||
          JSON.stringify(error, null, 2);

        alert("Send failed (edge function):\n\n" + msg);
        return;
      }

      console.log("EDGE FUNCTION SUCCESS:", data);

      setEmailModalOpen(false);
      setEmailDraft(null);

      showToast("Email sent ✅");
    } catch (err: any) {
      console.error("SEND EMAIL CRASH:", err);
      alert(
        "Send crashed:\n\n" +
          (err?.message ||
            err?.error_description ||
            err?.details ||
            JSON.stringify(err, null, 2))
      );
    }
  };

  // ===============================
  // OFFLINE / ONLINE STATE
  // ===============================
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);

    window.addEventListener("online", on);
    window.addEventListener("offline", off);

    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  };
  // ===============================
  // EMAIL DRAFT (in-app send window)
  // ===============================
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [sendMeCopy, setSendMeCopy] = useState(false);

  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() =>
    getRecents()
  );
  const [recentOpen, setRecentOpen] = useState(false);
  const refreshRecents = () => setRecentFiles(getRecents());

  // ===============================
  // STATE: ESTIMATE + UI
  // ===============================
  // ===============================
  // STATE: ESTIMATE + UI
  // ===============================
 type NavKey =
  | "estimator"
  | "proposals"
  | "pricingAdmin"
  | "analytics"
  | "settings"
  | "users"
  | "contract";  // ← ADD THIS


  const [activeNav, setActiveNav] = useState<NavKey>("estimator");

  // UL-WIDE body class (full width on Users/Licenses)
  useEffect(() => {
    document.body.classList.toggle("ul-wide", activeNav === "users");
    return () => document.body.classList.remove("ul-wide");
  }, [activeNav]);

  // keep users locked out if not authorized
  useEffect(() => {
    if (activeNav === "users" && !canSeeUsersLicenses) {
      setActiveNav("estimator");
    }
  }, [activeNav, canSeeUsersLicenses]);

  const EMAIL_DOMAINS = [
    "gmail.com",
    "icloud.com",
    "yahoo.com",
    "outlook.com",
    "hotmail.com",
  ];

  function getEmailSuggestions(input: string) {
    const v = (input || "").trim();
    const at = v.indexOf("@");
    if (at < 0) return [];
    const name = v.slice(0, at);
    const partial = v.slice(at + 1).toLowerCase();
    if (!name) return [];
    return EMAIL_DOMAINS.filter((d) => d.startsWith(partial))
      .slice(0, 5)
      .map((d) => `${name}@${d}`);
  }

  // ✅ FIX: this state must live at component level (NOT inside render)
  const [showBreakdown, setShowBreakdown] = useState(false);
const [showDeckingLevels, setShowDeckingLevels] = useState(false);

  const [estimateId, setEstimateId] = useState<string>(() => {
    try {
      return localStorage.getItem("du_estimate_id") || "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("du_estimate_id", estimateId);
    } catch {}
  }, [estimateId]);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  const [estimateName, setEstimateName] = useState<string>(() => {
    try {
      return localStorage.getItem("du_estimate_name") || "";
    } catch {
      return "";
    }
  });

  const getProposalIdForEstimate = (name: string) => {
    try {
      return (
        localStorage.getItem(
          `du_proposal_id::${name || "Untitled Estimate"}`
        ) || ""
      );
    } catch {
      return "";
    }
  };

  const [proposalId, setProposalId] = useState<string>(() =>
    getProposalIdForEstimate(estimateName)
  );

  useEffect(() => {
    const next = getProposalIdForEstimate(estimateName);
    if (next) setProposalId(next);
  }, [estimateName]);

  const [currentFileName, setCurrentFileName] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("du_estimate_name", estimateName);
    } catch {}
  }, [estimateName]);
  const [estimateNameLocked, setEstimateNameLocked] = useState<boolean>(() => {
    try {
      return localStorage.getItem("du_estimate_name_locked") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const on = activeNav === "users";
    document.body.classList.toggle("ul-wide", on);

    // TEMP debug:
    console.log("[UL-WIDE]", {
      activeNav,
      on,
      bodyClass: document.body.className,
    });

    return () => {
      // cleanup so it doesn't stick if component unmounts
      document.body.classList.remove("ul-wide");
    };
  }, [activeNav]);

  useEffect(() => {
    try {
      localStorage.setItem(
        "du_estimate_name_locked",
        estimateNameLocked ? "1" : "0"
      );
    } catch {}
  }, [estimateNameLocked]);

  const [clientTitle, setClientTitle] = useState("");
  const [clientLastName, setClientLastName] = useState("");
  const [clientLocation, setClientLocation] = useState<string>("");
  const [clientTown, setClientTown] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  useEffect(() => {
    const town = (clientTown || "").trim();
    const last = (clientLastName || "").trim();

    // need both fields filled out
    if (!town || !last) return;

    // if user saved/renamed, do not overwrite
    if (estimateNameLocked) return;

    // ✅ choose your format here:
    // const auto = `${town} ${last}`;     // space version
    const auto = `${town}_${last}`; // underscore version

    // only set if it changed
    if ((estimateName || "").trim() !== auto) {
      setEstimateName(auto);
      try {
        localStorage.setItem("du_estimate_name", auto);
      } catch {}
    }
  }, [clientTown, clientLastName, estimateNameLocked]);

  const [constructionType, setConstructionType] = useState<string>("");
  const [includePermit, setIncludePermit] = useState(false);
  const [msrpMode, setMsrpMode] = useState(false);

  const [selectedDeckingId, setSelectedDeckingId] = useState<string>("");
  const [deckingSqFt, setDeckingSqFt] = useState<number>(0);

  const [selectedRailingId, setSelectedRailingId] = useState<string>("");
  const [railingLf, setRailingLf] = useState<number>(0);

  const [selectedStairsId, setSelectedStairsId] = useState<string>("");
  const [stairsCount, setStairsCount] = useState<number>(0);

  const [selectedFastenerId, setSelectedFastenerId] = useState<string>("");

  const [selectedDemoId, setSelectedDemoId] = useState<string>("");
 
  const [demoQty, setDemoQty] = useState<number>(0);
  const [selectedSkirtingId, setSelectedSkirtingId] = useState<string>("");
  const [skirtingSf, setSkirtingSf] = useState<number>(0);
  const [skirtingCategory, setSkirtingCategory] = useState<
    "" | "Skirting" | "Lattice"
  >("");

  const [miValue, setMiValue] = useState<number>(0);
  const [emailSugOpen, setEmailSugOpen] = useState(false);
  const emailSuggestions = useMemo(
    () => getEmailSuggestions(clientEmail),
    [clientEmail]
  );
  const [skirtingDeckingId, setSkirtingDeckingId] = useState<string>("");
  const [skirtingDeckingTouched, setSkirtingDeckingTouched] = useState(false);
  const lastAutoSkirtingDeckingId = useRef<string>("");
  const [skirtingTypeTouched, setSkirtingTypeTouched] = useState(false);

  // ADD ITEM rows
  const [addItems, setAddItems] = useState<AddItemRow[]>([]);
  const addAddItemRow = () => {
    const newRow: AddItemRow = {
      rowId:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? uid()
          : `${Date.now()}-${Math.random()}`,
      category: "",
      itemId: "",
      qty: 0,
      constructionType: "",
      deckingId: "",
      customName: "",
      customPrice: 0,
    };
    setAddItems((prev) => [newRow, ...prev]);
  };
  const removeAddItemRow = (rowId: string) => {
    setAddItems((prev) => prev.filter((r) => r.rowId !== rowId));
  };
  const updateAddItemRow = (rowId: string, patch: Partial<AddItemRow>) => {
    setAddItems((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r))
    );
  };

  // ===============================
  // DIRTY STATE (unsaved changes)
  // ===============================
  const [isDirty, setIsDirty] = useState(false);
  const dirtySuspendedRef = useRef(true);
  const markDirty = () => {
    if (dirtySuspendedRef.current) return;
    setIsDirty(true);
  };
  const [lastSavedFileName, setLastSavedFileName] = useState<string | null>(
    null
  );

  // ===============================
  // USER SETTINGS (for Proposal PDF)
  // ===============================
  // NOTE: Keeping your existing shape so SettingsPage / ProposalPage don't break.
  // We are only removing “email proposal / email preview” UI behavior from App.
  const [userSettings, setUserSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("du_user_settings");
      return saved
        ? {
            proposalLayoutOrder: [],
            ...JSON.parse(saved),
          }
        : {
            userName: "Jason Colapinto",
            userPhone: "",
            userEmail: "",

            companyName: "Decks Unique",
            companyPhone: "",
            companyAddress: "",
            companyWebsite: "",
            companySlogan: "",
            license: "",

            logoDataUrl: "",
            emailSubjectTemplate:
              "Your Decks Unique Proposal – {{clientTown}} {{clientLastName}}",
            emailBodyTemplate:
              "Hi {{clientTitle}} {{clientLastName}},\n\n" +
              "Thank you for the opportunity to quote your project.\n" +
              "Attached is your proposal for review.\n\n" +
              "If you have any questions, reply here or call/text me at {{userPhone}}.\n\n" +
              "Thanks,\n" +
              "{{userName}}\n" +
              "{{companyName}}",
          };
    } catch {
      return {
        companyName: "Decks Unique",
        userName: "Jason Colapinto",
        userPhone: "",
        userEmail: "",
        license: "",
        logoDataUrl: "",
      };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("du_user_settings", JSON.stringify(userSettings));
    } catch {}
  }, [userSettings]);

  // ===============================
  // FILE OPEN/SAVE helpers
  // ===============================
  const hasUnsavedEstimateChanges = () => {
    return (
      !!clientLastName ||
      !!clientTown ||
      !!clientEmail ||
      !!constructionType ||
      !!selectedDeckingId ||
      deckingSqFt > 0 ||
      !!selectedRailingId ||
      railingLf > 0 ||
      !!selectedStairsId ||
      (stairsCount ?? 0) > 0 ||
      !!selectedFastenerId ||
      !!selectedDemoId ||
      demoQty > 0 ||
      !!skirtingCategory ||
      !!selectedSkirtingId ||
      skirtingSf > 0 ||
      !!miValue ||
      includePermit ||
      msrpMode ||
      addItems.length > 0
    );
  };

  const handleNewProject = () => {
    setClientTitle("");
    setClientLastName("");
    setClientTown("");
    setClientEmail("");

    setConstructionType("");
    setIncludePermit(false);
    setMsrpMode(false);

    setSelectedDeckingId("");
    setDeckingSqFt(0);
    setSelectedRailingId("");
    setRailingLf(0);
    setSelectedStairsId("");
    setStairsCount(0);
    setSelectedFastenerId("");

    setSelectedDemoId("");
    setDemoQty(0);

    setSkirtingCategory("");
    setSelectedSkirtingId("");
    setSkirtingSf(0);

    setMiValue(0);
    setAddItems([]);

    setEstimateName("");
    setEstimateId("");
    setProposalId("");
    setEstimateNameLocked(false);

    try {
      localStorage.removeItem("du_estimate_name");
      localStorage.removeItem("du_estimate_id");
      localStorage.removeItem("du_estimate_name_locked");
    } catch {}

    setActiveNav("estimator");
    setIsDirty(false);
    setShowBreakdown(false);
  };

  const requestNewProject = () => {
    if (hasUnsavedEstimateChanges()) setConfirmNewOpen(true);
    else handleNewProject();
  };

  const cancelNew = () => setConfirmNewOpen(false);
  const discardAndNew = () => {
    setConfirmNewOpen(false);
    handleNewProject();
  };

  const buildSnapshot = () => ({
    estimateId,
    savedAt: new Date().toISOString(),
    estimateName,

    clientTitle,
    clientLastName,
    clientTown,
    clientEmail,

    constructionType,
    includePermit,
    msrpMode,

    selectedDeckingId,
    deckingSqFt,
    selectedRailingId,
    railingLf,
    selectedStairsId,
    stairsCount,
    selectedFastenerId,

    selectedDemoId,
    demoQty,
    skirtingCategory,
    selectedSkirtingId,
    skirtingSf,
    miValue,

    addItems,
  });

  const applySnapshot = (snap: any) => {
    setEstimateName(snap.estimateName || "");
    setEstimateId(snap.estimateId || uid());

    setClientTitle(snap.clientTitle || "");
    setClientLastName(snap.clientLastName || "");
    setClientTown(snap.clientTown || "");
    setClientEmail(snap.clientEmail || "");

    setConstructionType(snap.constructionType || "");
    setIncludePermit(!!snap.includePermit);
    setMsrpMode(!!snap.msrpMode);

    setSelectedDeckingId(snap.selectedDeckingId || "");
    setDeckingSqFt(Number(snap.deckingSqFt || 0));

    setSelectedRailingId(snap.selectedRailingId || "");
    setRailingLf(Number(snap.railingLf || 0));

    setSelectedStairsId(snap.selectedStairsId || "");
    setStairsCount(Number(snap.stairsCount || 0));

    setSelectedFastenerId(snap.selectedFastenerId || "");

    setSelectedDemoId(snap.selectedDemoId || "");
    setDemoQty(Number(snap.demoQty || 0));

    setSkirtingCategory((snap.skirtingCategory as any) || "");
    setSelectedSkirtingId(snap.selectedSkirtingId || "");
    setSkirtingSf(Number(snap.skirtingSf || 0));

    setMiValue(Number(snap.miValue || 0));
    setAddItems(Array.isArray(snap.addItems) ? snap.addItems : []);

    setIsDirty(false);
    setShowBreakdown(false);
  };
  // ===============================
  // EMAIL PROPOSAL (JOIST STYLE)
  // 1) Save proposal to Supabase
  // 2) Call Edge Function to SEND email
  // 3) Show success toast
  // ===============================

  const renderTemplate = (
    tpl: string,
    vars: Record<string, string>
  ): string => {
    return (tpl || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
      return vars[key] ?? "";
    });
  };
  const handleEmailProposal = async () => {
    const to = (clientEmail || "").trim();

    if (!to) {
      showToast("Enter the client email first (Estimator → Client Email).");
      setActiveNav("estimator");
      return;
    }

    // if offline, we cannot create a /review link
    if (!isOnline) {
      // Queue a placeholder email (no share link yet)
      setEmailDraft({
        to,
        subject: renderTemplate(
          userSettings?.emailSubjectTemplate ||
            "Your Proposal – {{clientLastName}}",
          {
            clientTitle: (clientTitle || "").trim(),
            clientLastName: (clientLastName || "").trim(),
            clientTown: (clientTown || "").trim(),
            clientEmail: (clientEmail || "").trim(),
            userName: (userSettings?.userName || "").trim(),
            userPhone: (userSettings?.userPhone || "").trim(),
            userEmail: (userSettings?.userEmail || "").trim(),
            companyName: (userSettings?.companyName || "").trim(),
          }
        ),
        body: "Offline mode: proposal link will be generated and sent automatically when you're back online.\n",
        link: "",
        proposalId: "",
      });

      setEmailModalOpen(true);
      showToast("Offline: draft opened. Click Send to queue it ✅");
      return;
    }

    try {
      // Ensure we have an estimateId for tracking
      const ensuredEstimateId = estimateId || uid();
      if (!estimateId) setEstimateId(ensuredEstimateId);

      // 1) Save proposal to Supabase
      const findItem = (id: string) =>
        pricingItems.find((p: any) => String(p.id) === String(id));

      const deckRow = selectedDeckingId ? findItem(selectedDeckingId) : null;
      const railRow = selectedRailingId ? findItem(selectedRailingId) : null;
      const stairRow = selectedStairsId ? findItem(selectedStairsId) : null;
      const fastRow = selectedFastenerId ? findItem(selectedFastenerId) : null;
      const demoRow = selectedDemoId ? findItem(selectedDemoId) : null;
      const skirtRow = selectedSkirtingId ? findItem(selectedSkirtingId) : null;

      const deckingType = (deckRow?.name || "").toString();
      const railingType = (railRow?.name || "").toString();
      const stairsType = (stairRow?.name || "").toString();
      const fastenerType = (fastRow?.name || "").toString();
      const demoType = (demoRow?.name || "").toString();
      const skirtingType = (skirtRow?.name || "").toString();
      const deckingDescription = (deckRow as any)?.proposal_description || null;
      const railingDescription = (railRow as any)?.proposal_description || null;
      const stairsDescription = (stairRow as any)?.proposal_description || null;
      const fastenerDescription =
        (fastRow as any)?.proposal_description || null;
      const demoDescription = (demoRow as any)?.proposal_description || null;
      const skirtingDescription =
        (skirtRow as any)?.proposal_description || null;

      const deckingQty = Number(deckingSqFt || 0);
      const deckingUnit = "sf";
      const railingQty = Number(railingLf || 0);
      const railingUnit = "lf";
      const stairsQty = Number(stairsCount || 0);
      const stairsUnit = "ea";
      const fastenerQty = Number(fastenerQtyAuto || 0);
      const fastenerUnit = "ea";
      const skirtingQty = Number(skirtingSf || 0);
      const skirtingUnit = "sf";
// ✅ Ensure emailed/review proposal uses the SAME full sections as Print Proposal
let sectionsSnapshot: any[] | null = null;

try {
  if (orgId) {
    const { data: secs, error: secsErr } = await supabase
      .from("org_proposal_sections")
      .select("*")
      .eq("org_id", orgId)
      .order("sort_order", { ascending: true });

    if (secsErr) throw secsErr;
    sectionsSnapshot = Array.isArray(secs) ? secs : null;
  }
} catch (e) {
  // If snapshot fetch fails, we fall back to whatever buildSnapshot() has
  sectionsSnapshot = null;
}

      const payload = {
        estimate_name: estimateName || "Untitled Estimate",
        data: {
          // ✅ keep snapshot fields (good for timeline/notes keys etc.)
          ...buildSnapshot(),
proposalSectionsSnapshot:
  sectionsSnapshot ?? (buildSnapshot() as any)?.proposalSectionsSnapshot ?? null,

          // ✅ REQUIRED by ProposalPage.tsx
          userSettings,

          estimateName,
          finalEstimate,
          constructionType,
          sowModeSnapshot:
            (localStorage.getItem(`du_sow_mode::${estimateName}`) as any) ||
            "auto",
          sowCustomTextSnapshot:
            localStorage.getItem(`du_sow_custom::${estimateName}`) || "",
          startWeeksSnapshot: Number(
            localStorage.getItem(`du_timeline_start_weeks::${estimateName}`) ||
              3
          ),
          durationDaysSnapshot: Number(
            localStorage.getItem(
              `du_timeline_duration_days::${estimateName}`
            ) || 2
          ),

          clientTitle,
          clientLastName,
          clientTown,
          clientEmail,

          deckingSubtotal,
          railingSubtotal,
          stairsSubtotal,
          fastenerSubtotal,
          demoSubtotal,
          skirtingSubtotal,

          addItemsDetailed,
          upliftMultiplier,
          showLineItemPricesSnapshot:
            localStorage.getItem(`du_show_line_prices::${estimateName}`) ===
            "1",

          deckingType,
          railingType,
          stairsType,
          fastenerType,
          demoType,
          skirtingType,
          deckingDescription,
          railingDescription,
          stairsDescription,
          fastenerDescription,
          demoDescription,
          skirtingDescription,

          deckingQty,
          deckingUnit,
          railingQty,
          railingUnit,
          stairsQty,
          stairsUnit,
          fastenerQty,
          fastenerUnit,
          skirtingQty,
          skirtingUnit,
        },
      };

     const storageKey = `du_proposal_id::${estimateName || "Untitled Estimate"}`;
const existingId = localStorage.getItem(storageKey);

let savedId: string | null = null;

if (existingId) {
  // Update existing proposal snapshot (keeps the same review link)
  const { error: upErr } = await supabase
    .from("proposals")
    .update({
      estimate_name: payload.estimate_name,
      data: payload.data,
    })
    .eq("id", existingId);

  if (upErr) throw upErr;

  savedId = existingId;
} else {
  // First time: create proposal row
  const { data: ins, error: insErr } = await supabase
    .from("proposals")
    .insert(payload)
    .select("id")
    .single();

  if (insErr) throw insErr;

  savedId = ins?.id ?? null;

  if (savedId) {
    localStorage.setItem(storageKey, savedId);
    setProposalId(savedId);
  }
}

     function getPublicBaseUrl() {
  const origin = window.location.origin;

  // ✅ Always force production emails to use your real public domain
  if (
    origin.includes("github.dev") ||
    origin.includes("localhost") ||
    origin.includes("codesandbox.io")
  ) {
    return "https://estimator-app.pages.dev";
  }

  return origin.replace(/\/$/, "");
}


      if (!savedId) {
        alert("Could not generate proposal link. Please try again.");
        return;
      }

      const proposalId = savedId;
      const link = `${getPublicBaseUrl()}/review/${proposalId}`;

      // 2) Build subject/body from Settings templates
      const vars: Record<string, string> = {
        clientTitle: (clientTitle || "").trim(),
        clientLastName: (clientLastName || "").trim(),
        clientTown: (clientTown || "").trim(),
        clientEmail: (clientEmail || "").trim(),

        userName: (userSettings?.userName || "").trim(),
        userPhone: (userSettings?.userPhone || "").trim(),
        userEmail: (userSettings?.userEmail || "").trim(),
        companyName: (userSettings?.companyName || "").trim(),
      };

      const subject = renderTemplate(
        userSettings?.emailSubjectTemplate ||
          "Your Proposal – {{clientLastName}}",
        vars
      );

      // Add the link at the bottom (always)
      const bodyBase = renderTemplate(
        userSettings?.emailBodyTemplate || "",
        vars
      );

     // Add the link at the bottom (always)

const body = (bodyBase || "").trim();

      // helpful: copy link to clipboard
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        // ignore if browser blocks it
      }
      // 3) Store draft + open in-app send window
setEmailDraft({ to, subject, body, link, proposalId: proposalId || undefined });

      setEmailModalOpen(true);
    } catch (err: any) {
      console.error("EMAIL PROPOSAL ERROR:", err);

      const msg =
        err?.message ||
        err?.error_description ||
        err?.details ||
        JSON.stringify(err, null, 2);

      showToast("Email Proposal failed. Check console for details.");
      console.error("EMAIL PROPOSAL ERROR DETAILS:", msg);
    }
  };

  // ===============================
  // FILE → OPEN
  // ===============================
  const openFileInputRef = useRef<HTMLInputElement | null>(null);
  const onPickOpenFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const snapshot = JSON.parse(text);
      if (!snapshot || typeof snapshot !== "object") {
        alert("Invalid estimate file.");
        return;
      }

      applySnapshot(snapshot);
      setLastSavedFileName(file.name);

      const recentName =
        (snapshot.estimateName || "").trim() ||
        file.name.replace(/\.json$/i, "").replace(/\.duest$/i, "");

      pushRecent(recentName, snapshot);
      refreshRecents();

      dirtySuspendedRef.current = false;
      setActiveNav("estimator");
    } catch (err: any) {
      alert("Could not open that file. It may be corrupted.");
      console.error(err);
    } finally {
      e.target.value = "";
    }
  };

const EST_EXT = ".DUest";

  const defaultFileName = () => {
    const town = (clientTown || "").trim();
    const last = (clientLastName || "").trim();
    const base = [town, last].filter(Boolean).join("_").trim() || "Estimate";
    const name = (estimateName || "").trim();
    const file = `${name || base}${EST_EXT}`;
    return file.replace(/\s+/g, "_");
  };

  const normalizeFileName = (name: string) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return "";
    if (trimmed.toLowerCase().endsWith(".json"))
      return trimmed.slice(0, -5) + EST_EXT;
    if (!trimmed.toLowerCase().endsWith(EST_EXT.toLowerCase()))
      return trimmed + EST_EXT;
    return trimmed;
  };

  const downloadTextFile = (filename: string, text: string) => {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleFileSaveAs = () => {
    const input = prompt("Save As file name:", defaultFileName());
    if (!input) return;

    const filename = normalizeFileName(input);
    if (!filename) return;

    const ensuredEstimateId = estimateId || uid();
    if (!estimateId) setEstimateId(ensuredEstimateId);

    const snap = { ...buildSnapshot(), estimateId: ensuredEstimateId };

    const recentLabel = filename.replace(new RegExp(`${EST_EXT}$`, "i"), "");
    pushRecent(recentLabel, snap);
    refreshRecents();

    downloadTextFile(filename, JSON.stringify(snap, null, 2));
    setLastSavedFileName(filename);
    setIsDirty(false);
  };

  const handleFileSave = () => {
    // If we don't yet have a saved filename, guide the user to Save As first
    if (!lastSavedFileName) {
      alert("Please use 'Save As' first to choose a file name.");
      return;
    }

    const ok = window.confirm(
      `Overwrite existing file?\n\n${lastSavedFileName}\n\nThis will replace the previous version.`
    );
    if (!ok) return;

    const snap = buildSnapshot();

    const recentLabel = lastSavedFileName.replace(
      new RegExp(`${EST_EXT}$`, "i"),
      ""
    );
    pushRecent(recentLabel, snap);
    refreshRecents();

    downloadTextFile(lastSavedFileName, JSON.stringify(snap, null, 2));
    setIsDirty(false);
  };

  const handleFileOpen = () => openFileInputRef.current?.click();

  const openRecent = (rf: RecentFile) => {
    try {
      applySnapshot(rf.json);
      pushRecent(rf.name, rf.json);
      refreshRecents();
      setRecentOpen(false);
      setFileOpen(false);
      setActiveNav("estimator");
    } catch (e) {
      console.error("Failed to open recent:", e);
      alert("Could not open that recent file.");
    }
  };
  const buildDefaultEstimateName = () => {
    const town = (clientTown || "").trim();
    const last = (clientLastName || "").trim();
    const baseName = `${town} ${last}`.trim();

    if (!town || !last) return "";

    const counterKey = `du_estimate_counter::${baseName.toLowerCase()}`;
    const current = Number(localStorage.getItem(counterKey) || "0");
    const next = current + 1;
    localStorage.setItem(counterKey, String(next));

    return `${baseName} Est${next}`;
  };

  const saveAndNew = () => {
    handleFileSaveAs(); // <-- force prompt + default filename
    setConfirmNewOpen(false);
    handleNewProject();
  };

  // ===============================
  // ✅ PRICING STATE (FIXED)
  // ===============================
  const [pricingItems, setPricingItems] = useState<PricingItemRow[]>([]);
  useEffect(() => {
    // Only do this when user selected "Skirting"
    if (skirtingCategory !== "Skirting") {
      lastAutoSkirtingDeckingId.current = "";
      setSkirtingTypeTouched(false); // reset for next time
      return;
    }

    // Need a decking selected to match against
    if (!selectedDeckingId) return;

    // If user already manually chose a skirting type, don't override
    if (skirtingTypeTouched) return;

    // If we already auto-set for this same decking id, do nothing
    if (lastAutoSkirtingDeckingId.current === selectedDeckingId) return;

    // Find the selected decking record
    const deckRow = pricingItems.find(
      (p: any) => String(p.id) === String(selectedDeckingId)
    );
    const deckName = (deckRow?.name || "").trim().toLowerCase();
    if (!deckName) return;

    // Pull skirting options (your category might be "Skirting" or "Skirting_options")
    const skirtingOptions = pricingItems.filter((p: any) =>
      String(p.category || "")
        .toLowerCase()
        .includes("skirting")
    );

    // Match by name containing the decking name (your naming convention)
    const match = skirtingOptions.find((p: any) =>
      String(p.name || "")
        .trim()
        .toLowerCase()
        .includes(deckName)
    );

    if (match) {
      setSelectedSkirtingId(String(match.id));
      lastAutoSkirtingDeckingId.current = selectedDeckingId;
    }
  }, [skirtingCategory, selectedDeckingId, pricingItems, skirtingTypeTouched]);

  const [pricingCategories, setPricingCategories] = useState<
    PricingCategoryRow[]
  >([]);
  const [pricingLoaded, setPricingLoaded] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);

  // ------------------------------
  // LOAD PRICING (NETWORK FIRST, CACHE FALLBACK)
  // ------------------------------
  useEffect(() => {
    const loadPricing = async () => {
      setPricingLoaded(false);
      setPricingError(null);

      // helper: apply items/cats to state
      const applyPricing = (itemsRaw: any[], catsRaw: any[]) => {
        const cleanedItems = (itemsRaw || []).map((r: any) => ({
          ...r,
          active: r.active !== false,
          deleted_at: r.deleted_at ?? null,
          category: r.category ?? null,
          category2: r.category2 ?? null,
        }));

        setPricingItems(cleanedItems as PricingItemRow[]);
        setPricingCategories((catsRaw || []) as PricingCategoryRow[]);
        setPricingLoaded(true);
        dirtySuspendedRef.current = false;
      };

      // 1) Try Supabase first
      try {
        const [itemsRes, catsRes] = await Promise.all([
          supabase
            .from("pricing_items2")
            .select("*")
            .order("sort_order", { ascending: true })
            .order("name", { ascending: true }),
          supabase
            .from("pricing_categories")
            .select("id, name, is_active")
            .order("name", { ascending: true }),
        ]);

        if (itemsRes.error) throw itemsRes.error;
        if (catsRes.error) throw catsRes.error;

        const items = itemsRes.data || [];
        const cats = catsRes.data || [];

        // ✅ cache successful response
        try {
          localStorage.setItem(PRICING_ITEMS_CACHE_KEY, JSON.stringify(items));
          localStorage.setItem(PRICING_CATS_CACHE_KEY, JSON.stringify(cats));
          localStorage.setItem(PRICING_CACHE_TS_KEY, String(Date.now()));
        } catch {}

        applyPricing(items, cats);
        return;
      } catch (err: any) {
        // 2) If Supabase fails, try cache
        try {
          const rawItems = localStorage.getItem(PRICING_ITEMS_CACHE_KEY);
          const rawCats = localStorage.getItem(PRICING_CATS_CACHE_KEY);

          if (rawItems && rawCats) {
            const cachedItems = JSON.parse(rawItems);
            const cachedCats = JSON.parse(rawCats);

            applyPricing(cachedItems, cachedCats);
            setPricingError(
              "Offline mode: using last saved pricing. (Reconnect to refresh.)"
            );
            return;
          }
        } catch {}

        // 3) No cache available
        setPricingError(
          err?.message ||
            "Offline mode: no cached pricing yet. Using empty pricing lists."
        );
        setPricingLoaded(true);
      }
    };

    loadPricing();
  }, []);

  // ===============================
  // ESTIMATOR DERIVED DATA
  // ===============================
  const constructionTypeRef = useRef<HTMLSelectElement | null>(null);
  const skirtingCategoryRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    if (activeNav === "estimator" && pricingLoaded) {
      constructionTypeRef.current?.focus();
    }
  }, [activeNav, pricingLoaded]);

  const deckingOptions = pricingItems
    .filter((item) => {
      const cat = (item.category || "").toLowerCase().trim();
      const unit = (item.unit || "").toLowerCase().trim();
      const isDeckMaterial =
        (cat === "decking" || cat === "ipe" || cat === "composite_decking") &&
        unit === "sf";
      return (
        isDeckMaterial &&
        item.active !== false &&
        (item.deleted_at ?? null) == null
      );
    })
    .sort((a, b) => {
      const aOrder = a.sort_order ?? 999;
      const bOrder = b.sort_order ?? 999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.name.localeCompare(b.name);
    });

  const stairsOptions = pricingItems
    .filter((item) => {
      const cat1 = (item.category || "").toLowerCase().trim();
      const cat2 = (item.category2 || "").toLowerCase().trim();
      return (
        (cat1 === "stair_options" || cat2 === "stair_options") &&
        item.active !== false &&
        (item.deleted_at ?? null) == null
      );
    })
    .sort((a, b) => {
      const aOrder = a.sort_order ?? 999;
      const bOrder = b.sort_order ?? 999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.name.localeCompare(b.name);
    });

  const fastenerOptions = pricingItems
    .filter((item) => {
      const cat = item.category?.toLowerCase().trim();
      return (
        cat &&
        cat.includes("fasten") &&
        item.active !== false &&
        (item.deleted_at ?? null) == null
      );
    })
    .sort((a, b) => {
      const aOrder = a.sort_order ?? 999;
      const bOrder = b.sort_order ?? 999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.name.localeCompare(b.name);
    });

  const demoOptions = pricingItems
    .filter((item) => {
      const cat = (item.category || "").toLowerCase().trim();
      return (
        (cat === "demolition" || cat === "demo") &&
        item.active !== false &&
        (item.deleted_at ?? null) == null
      );
    })
    .sort((a, b) => {
      const aOrder = a.sort_order ?? 999;
      const bOrder = b.sort_order ?? 999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.name.localeCompare(b.name);
    });

  const skirtingOnlyOptions = pricingItems
    .filter((item) => {
      const cat = (item.category || "").toLowerCase().trim();
      const cat2 = (item.category2 || "").toLowerCase().trim();
      return (
        (cat === "skirting" || cat2 === "skirting") &&
        item.active !== false &&
        (item.deleted_at ?? null) == null
      );
    })
    .sort((a, b) => {
      const aOrder = a.sort_order ?? 999;
      const bOrder = b.sort_order ?? 999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.name.localeCompare(b.name);
    });

  const latticeOnlyOptions = pricingItems.filter((item) => {
    const cat = (item.category || "").toLowerCase().trim();
    const cat2 = (item.category2 || "").toLowerCase().trim();
    return (
      (cat === "lattice" || cat2 === "lattice") &&
      item.active !== false &&
      (item.deleted_at ?? null) == null
    );
  });

  const skirtingLatticeOptions =
    skirtingCategory === "Skirting"
      ? skirtingOnlyOptions
      : skirtingCategory === "Lattice"
      ? latticeOnlyOptions
      : [];

  const railingOptions = pricingItems
    .filter((item) => {
      const cat = (item.category ?? "").toLowerCase().trim();
      const unit = (item.unit ?? "").toLowerCase().trim();
      return (
        cat === "railing" &&
        unit === "lf" &&
        item.active !== false &&
        (item.deleted_at ?? null) == null
      );
    })
    .sort((a, b) => {
      const aOrder = a.sort_order ?? 999;
      const bOrder = b.sort_order ?? 999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });

  const constructionOptions = pricingItems
    .filter(
      (item) =>
        (item.category || "").toLowerCase().trim() === "construction_options"
    )
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));

  const selectedDecking = deckingOptions.find(
    (d) => String(d.id) === selectedDeckingId
  );
  const selectedRailing = railingOptions.find(
    (r) => String(r.id) === selectedRailingId
  );
  const selectedFastener = fastenerOptions.find(
    (f) => String(f.id) === selectedFastenerId
  );
  const selectedDemo = demoOptions.find((d) => String(d.id) === selectedDemoId);
  const selectedSkirting = skirtingLatticeOptions.find(
    (s) => String(s.id) === selectedSkirtingId
  );

  const selectedConstruction = constructionOptions.find(
    (c) => c.name === constructionType
  );
  useEffect(() => {
    // Only auto-pick once a decking type exists
    if (!selectedDeckingId) return;

    // Don’t override if user already chose a fastener
    if (selectedFastenerId) return;

    // Find "Hidden Clips" in your fastener options
    const hiddenClips = fastenerOptions.find((it) =>
      normalizeName(it.name || "").includes("hidden clips")
    );

    if (hiddenClips?.id != null) {
      setSelectedFastenerId(String(hiddenClips.id));
    }
  }, [selectedDeckingId, selectedFastenerId, fastenerOptions]);

  const constructionAdj = selectedConstruction?.cost ?? 0;

  const baseDeckingUnit = selectedDecking?.cost ?? 0;
  const adjustedDeckingUnit = baseDeckingUnit + constructionAdj;

  const deckingSubtotal = adjustedDeckingUnit * deckingSqFt;

  const baseRailingUnit = selectedRailing?.cost ?? 0;
  const railingSubtotal = baseRailingUnit * railingLf;
  // ===============================
  // STAIRS — shared pricing helper
  // (used by Main Stairs + Add Item stairs)
  // ===============================
  function computeEffectiveStairsRate(params: {
    pricingItems: PricingItemRow[];
    selectedDecking: PricingItemRow | undefined;
    stairOptionRow: PricingItemRow | null; // row from stair_options
  }): { baseUnit: number; effectiveRate: number; tooltip: string } {
    const { pricingItems, selectedDecking, stairOptionRow } = params;

    if (!selectedDecking) {
      return {
        baseUnit: 0,
        effectiveRate: 0,
        tooltip: "Select Decking Type to price stairs",
      };
    }

    // base stair row is in category "stair" and name matches decking name
    const deckNm = normalizeName(selectedDecking.name || "");
    const baseStairRow = pricingItems.find((it) => {
      if (it.active === false) return false;
      if ((it.deleted_at ?? null) != null) return false;

      const cat = normalizeCat(it.category || "");
      if (cat !== "stair") return false;

      return normalizeName(it.name || "") === deckNm;
    });

    const baseUnit = Number(baseStairRow?.cost || 0);
    if (baseUnit <= 0) {
      return {
        baseUnit: 0,
        effectiveRate: 0,
        tooltip: `Missing base stair price: category "stair" name "${selectedDecking.name}"`,
      };
    }

    // no option selected => base stairs
    if (!stairOptionRow) {
      return {
        baseUnit,
        effectiveRate: baseUnit,
        tooltip: `Base stairs: $${baseUnit.toFixed(2)}/lf`,
      };
    }

    const optUnit = String(stairOptionRow.unit || "")
      .toLowerCase()
      .trim();
    const optCost = Number(stairOptionRow.cost || 0);
    const optName = (stairOptionRow.name || "Stair Option").toString().trim();

    let effectiveRate = baseUnit;

    if (optUnit === "multiplier") {
      effectiveRate = baseUnit * optCost;
      return {
        baseUnit,
        effectiveRate,
        tooltip: `${optName}: ${optCost} × $${baseUnit.toFixed(
          2
        )}/lf = $${effectiveRate.toFixed(2)}/lf`,
      };
    }

    if (optUnit === "addon_lf") {
      effectiveRate = baseUnit + optCost;
      return {
        baseUnit,
        effectiveRate,
        tooltip: `${optName}: $${baseUnit.toFixed(2)}/lf + $${optCost.toFixed(
          2
        )}/lf = $${effectiveRate.toFixed(2)}/lf`,
      };
    }

    if (optUnit === "lf") {
      effectiveRate = optCost;
      return {
        baseUnit,
        effectiveRate,
        tooltip: `${optName}: $${effectiveRate.toFixed(2)}/lf (override)`,
      };
    }

    // fallback: treat as override
    effectiveRate = optCost;
    return {
      baseUnit,
      effectiveRate,
      tooltip: `${optName}: $${effectiveRate.toFixed(2)}/lf`,
    };
  }

  const selectedStairOption = stairsOptions.find(
    (s) => String(s.id) === String(selectedStairsId)
  );
  const stairsCalc = computeEffectiveStairsRate({
    pricingItems,
    selectedDecking,
    stairOptionRow: selectedStairOption || null,
  });

  const baseStairsUnit = stairsCalc.baseUnit;
  const effectiveStairsRate = stairsCalc.effectiveRate;

  const stairsSubtotal = effectiveStairsRate * (stairsCount ?? 0);

  const baseFastenerUnit = selectedFastener?.cost ?? 0;
  const fastenerQtyAuto = deckingSqFt || 0;
  const fastenerSubtotal = baseFastenerUnit * fastenerQtyAuto;

  const baseDemoUnit = selectedDemo?.cost ?? 0;
  const demoSubtotal = baseDemoUnit * demoQty;
function computeEffectiveSkirtingRate(params: {
  selectedDeckingUnit: number; // IMPORTANT: pass ADJUSTED decking $/sf here
  skirtingRow: PricingItemRow | undefined;
}): { effectiveRate: number; tooltip: string } {
  const { selectedDeckingUnit, skirtingRow } = params;

  if (!skirtingRow) {
    return { effectiveRate: 0, tooltip: "Select skirting/lattice type" };
  }

  const unit = String(skirtingRow.unit || "").toLowerCase().trim();
  const cost = Number(skirtingRow.cost || 0);

  // ✅ Skirting rows that are deck-based:
  // - multiplier = baseDeckSf * cost
  // - addon_sf   = baseDeckSf + cost
  if (unit === "multiplier") {
    const rate = selectedDeckingUnit * cost;
    return {
      effectiveRate: rate,
      tooltip: `${skirtingRow.name}: ${cost} × $${selectedDeckingUnit.toFixed(
        2
      )}/sf = $${rate.toFixed(2)}/sf`,
    };
  }

  if (unit === "addon_sf") {
    const rate = selectedDeckingUnit + cost;
    return {
      effectiveRate: rate,
      tooltip: `${skirtingRow.name}: $${selectedDeckingUnit.toFixed(
        2
      )}/sf + $${cost.toFixed(2)}/sf = $${rate.toFixed(2)}/sf`,
    };
  }

  // ✅ fixed price per sf (ex: lattice) or override
  return {
    effectiveRate: cost,
    tooltip: `${skirtingRow.name}: $${cost.toFixed(2)}/sf`,
  };
}
const skirtingCalc = computeEffectiveSkirtingRate({
  // ✅ use ADJUSTED decking rate (base + construction adj)
  selectedDeckingUnit: adjustedDeckingUnit,
  skirtingRow: selectedSkirting,
});

const effectiveSkirtingRate = skirtingCalc.effectiveRate;
const skirtingSubtotal = effectiveSkirtingRate * skirtingSf;


  // ===============================
  // ADD ITEMS — categories + pricing
  // ===============================
  const addItemCategories = useMemo(() => {
    const BLOCKED = new Set(
      [
        "uplift",
        "uplifts",
        "price_adjusters",
        "price adjusters",
        "global_multiplier",
        "admin",
        "internal",

        // ⛔ remove from Add Item menu
        "construction",
        "construction options",
        "construction types",

        // ✅ remove core estimator categories from Add Items
        "decking",
        "composite_decking",
        "ipe",

        // ✅ hide base stair pricing category (still used for calculations)
        "stair",
        "stairs",
      ].map((s) => s.toLowerCase())
    );

    const cats = (pricingCategories || [])
      .filter((c) => c.is_active)
      .map((c) => (c?.name || "").trim())
      .filter(Boolean)
      .filter((name) => !BLOCKED.has(name.toLowerCase()));

    // ✅ Ensure "Misc" is always available
    const hasMisc = cats.some((c) => normalizeCat(c) === "misc");
    const withMisc = hasMisc ? cats : ["Misc", ...cats];

    return withMisc;
  }, [pricingCategories]);

  const addItemOptionsForRow = (row: AddItemRow) => {
    const want = normalizeCat(row.category || "");
    if (!want) return [];
    if (want === "misc") return [];
    if (want === "construction_options") return [];

    // simple aliases
    const wantAliases = new Set<string>([want]);
    if (want === "demolition") wantAliases.add("demo");

    return pricingItems
      .filter((it) => {
        if (it.active === false) return false;
        if ((it.deleted_at ?? null) != null) return false;

        const cat1 = normalizeCat(it.category || "");
        const cat2 = normalizeCat((it as any).category2 || "");

        return wantAliases.has(cat1) || wantAliases.has(cat2);
      })
      .sort((a, b) => {
        const aOrder = (a as any).sort_order ?? 999;
        const bOrder = (b as any).sort_order ?? 999;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (a.name || "").localeCompare(b.name || "");
      });
  };
  const selectedStairsRow = pricingItems.find(
    (p) => String(p.id) === String(selectedStairsId)
  );

  const addItemsDetailed = addItems.map((row) => {
    const rowCat = normalizeCat(row.category || "");
    if ((row.category || "").toLowerCase().includes("stair")) {
      console.log("ADD-ITEM DEBUG:", {
        category: row.category,
        rowCat,
        qty: row.qty,
        itemId: row.itemId,
      });
    }

    const isMisc = rowCat === "misc";
    let baseRow: any = null;
    // ✅ DB pricing row (use this for unit/cost math)
    let pickedRow = pricingItems.find(
      (p) => String(p.id) === String(row.itemId)
    );

    // ✅ dropdown options (use this for the dropdown list only)
    const opts = addItemOptionsForRow(row);
    const pickedOpt = opts.find(
      (o) => String((o as any).id) === String(row.itemId)
    );

    // ✅ Bench: match pricing item by benchType label if itemId is blank
    if (!pickedRow && rowCat === "bench") {
      const bt = (row as any)?.benchType || "";
      const benchLabel =
        BENCH_TYPES.find((x) => x.value === bt)?.label || "";
      const benchLabelLc = benchLabel.toLowerCase();
      const deckName = (selectedDecking?.name || "").toString().trim();
      const deckNameLc = deckName.toLowerCase();

      const wants12 = bt.includes("12");
      const wants18 = bt.includes("18");
      const wantsBack = bt.includes("back");
      const wantsStorage = bt.includes("storage");

      const exactBenchName = benchLabel.trim();

      // Preferred: match by bench label + selected decking name
      if (deckNameLc) {
        pickedRow = pricingItems.find((p) => {
          const cat = normalizeCat(p.category || "");
          if (cat !== "bench") return false;
          const nameLc = String(p.name || "").toLowerCase();
          if (!nameLc.includes(deckNameLc)) return false;

          // must match bench label/features too
          if (benchLabelLc && (nameLc.includes(benchLabelLc) || benchLabelLc.includes(nameLc))) {
            return true;
          }
          if (wants12 && !nameLc.includes("12")) return false;
          if (wants18 && !nameLc.includes("18")) return false;
          if (wantsBack && !nameLc.includes("back")) return false;
          if (wantsStorage && !nameLc.includes("storage")) return false;
          return nameLc.includes("bench");
        }) as any;
      }

      // Next: exact match against Pricing Admin bench names
      if (!pickedRow && exactBenchName) {
        pickedRow = pricingItems.find((p) => {
          const cat = normalizeCat(p.category || "");
          if (cat !== "bench") return false;
          const name = String(p.name || "").trim();
          return name === exactBenchName;
        }) as any;
      }

      // Fallback: label/feature matching
      if (!pickedRow) {
        pickedRow = pricingItems.find((p) => {
          const cat = normalizeCat(p.category || "");
          if (cat !== "bench") return false;
          const nameLc = String(p.name || "").toLowerCase();

          if (benchLabelLc && (nameLc.includes(benchLabelLc) || benchLabelLc.includes(nameLc))) {
            return true;
          }
          if (wants12 && !nameLc.includes("12")) return false;
          if (wants18 && !nameLc.includes("18")) return false;
          if (wantsBack && !nameLc.includes("back")) return false;
          if (wantsStorage && !nameLc.includes("storage")) return false;

          return nameLc.includes("bench");
        }) as any;
      }
    }

    // ✅ unify naming so the rest of your logic can use `picked`
    const picked: any = pickedRow || pickedOpt || null;

    const pickedNameRaw = (pickedRow?.name ?? pickedOpt?.name ?? "").toString();
    const pickedName = pickedNameRaw; // keep your existing variable name
    const pickedNameLc = pickedNameRaw.toLowerCase();
    // ✅ init these ONCE so any special pricing blocks can safely assign to them

    let lineBase = 0;
    let tooltip = "";
    let unitLabel = ((picked as any)?.unit || "ea").toString();
    let unit = unitLabel;
    let displayUnitCost = 0;

    // ----------------------------
    // ✅ STAIR OPTIONS (Add Item) = SAME pricing as the MAIN stairs selection up top
    // ----------------------------
    const isAddItemStairOptions = rowCat === "stair_options";

    if (isAddItemStairOptions) {
      const qtySafe = Number(row.qty || 0);

      const baseStairs = Number(selectedStairsRow?.cost || 0);
      const baseStairsName = (selectedStairsRow?.name || "").toString().trim();

      if (!baseStairsName || baseStairs <= 0) {
        displayUnitCost = 0;
        lineBase = 0;
        tooltip = "Select Stair Options (top of estimator) to price this item";
      } else {
        // price this add-item exactly like stairs up top
        displayUnitCost = baseStairs;
        lineBase = displayUnitCost * qtySafe;

        // ✅ force unit label to match stairs behavior
        unitLabel = "lf";
        unit = "lf";
      }
    }

    // ----------------------------
    // 1) MISC = fixed price, no uplift
    // ----------------------------
    if (isMisc) {
      const priceSafe = Number(row.customPrice || 0);
      const displayName = (row.customName || "").trim() || "Misc Item";
      const lineBase = priceSafe * 1;

      return {
        ...row,
        qty: 1,
        picked: { name: displayName } as any,
        unitCost: priceSafe,
        lineBase,
        unitLabel: "ea",
        unit: "ea",
        tooltip: `Fixed price: $${priceSafe.toFixed(2)} (no uplift)`,
        isFixedPrice: true,
        displayName,
      };
    }

    // ----------------------------
    // 2) CONSTRUCTION TYPE ROW (special row category)
    // ----------------------------
    const isConstructionRow = isConstructionTypeCategory(row.category || "");
    if (isConstructionRow) {
      const qtySafe = Number(row.qty || 0);

      const deckingRowForThisLine = pricingItems.find(
        (d) => String(d.id) === String(row.deckingId || "")
      );

      const baseRateSf = deckingRowForThisLine?.cost ?? 0;
      const adjSf = getConstructionAdjustment(row.category || "");
      const rateSf = baseRateSf + adjSf;

      const ctLabel =
        getConstructionTypeLabel(row.category || "") || "Construction";

      const lineBase =
        !deckingRowForThisLine || !row.deckingId || rateSf <= 0
          ? 0
          : rateSf * qtySafe;

      return {
        ...row,
        qty: qtySafe,
        picked: {
          name: `${ctLabel} – ${deckingRowForThisLine?.name || ""}`,
        } as any,
        unitCost: rateSf,
        lineBase,
        unitLabel: "sf",
        unit: "sf",
        tooltip: !row.deckingId
          ? "Select Decking Type"
          : `$${rateSf.toFixed(2)} / sf  ($${baseRateSf.toFixed(2)}${
              adjSf >= 0 ? " + " : " - "
            }${Math.abs(adjSf).toFixed(2)})`,
        isFixedPrice: false,
        displayName: `${ctLabel} – ${deckingRowForThisLine?.name || ""}`,
      };
    }
    // ----------------------------
    // 3A) BENCH PRICING (special)
    // ----------------------------
    if (normalizeCat(row.category || "") === "bench") {
      const qtyLf = Number(row.qty || 0);
      const bt = String(row.benchType || "12_flat"); // e.g. "12_flat", "12_back", "18_storage_back", etc.

      const deckName = (selectedDecking?.name || "").trim();
      const prettyType =
        BENCH_TYPES.find((x) => x.value === bt)?.label || "Bench";

      if (!deckName) {
        return {
          ...row,
          qty: qtyLf,
          picked: { name: prettyType } as any,
          unitCost: 0,
          lineBase: 0,
          unitLabel: "lf",
          unit: "lf",
          tooltip: "Select Decking Type to price bench",
          isFixedPrice: false,
          displayName: prettyType,
        };
      }

      const is18 = bt.startsWith("18_");

      // ✅ Base row lookup
      // 12": category Bench, name "<Decking> bench"
      // 18": category Bench_18in, name "<Decking> bench 18in"
      const baseNeedle = is18
        ? normalizeName(`${deckName} bench 18in`)
        : normalizeName(`${deckName} bench`);

      const baseRow = pricingItems.find((it) => {
        if (it.active === false) return false;
        if ((it.deleted_at ?? null) != null) return false;

        const cat = normalizeCat(it.category || "");
        const wantCat = is18 ? "bench_18in" : "bench";
        if (cat !== wantCat) return false;

        return normalizeName(it.name || "") === baseNeedle;
      });

      const baseBenchLf = Number(baseRow?.cost || 0);

      if (baseBenchLf <= 0) {
        return {
          ...row,
          qty: qtyLf,
          picked: { name: prettyType } as any,
          unitCost: 0,
          lineBase: 0,
          unitLabel: "lf",
          unit: "lf",
          tooltip: is18
            ? `Missing Supabase price: "${deckName} bench 18in" (Category: Bench_18in)`
            : `Missing Supabase price: "${deckName} bench" (Category: Bench)`,
          isFixedPrice: false,
          displayName: prettyType,
        };
      }

      const pickedBench = baseRow
        ? ({
            ...baseRow,
            name: prettyType,
            proposal_description:
              (baseRow as any)?.proposal_description ||
              (baseRow as any)?.description ||
              (baseRow as any)?.details ||
              "",
          } as any)
        : ({ name: prettyType } as any);


      // ✅ Add-ons:
      // 12" uses % from Supabase helper
      // 18" uses flat $ add-ons: +40 back, +10 storage (can stack if both)
      let unitCost = baseBenchLf;
      let tooltip = "";

      if (is18) {
        const addBack = bt.includes("_back") ? 40 : 0;
        const addStorage = bt.includes("_storage") ? 10 : 0;
        const addonPerLf = addBack + addStorage;

        unitCost = baseBenchLf + addonPerLf;

        tooltip =
          addonPerLf > 0
            ? `${prettyType}: $${unitCost.toFixed(
                2
              )}/lf = base $${baseBenchLf.toFixed(
                2
              )} + add $${addonPerLf.toFixed(2)}/lf`
            : `${prettyType}: $${unitCost.toFixed(
                2
              )}/lf = base $${baseBenchLf.toFixed(2)}`;
      } else {
        const backPct = bt.includes("_back")
          ? getBenchAddonPct(pricingItems, "12", "back")
          : 0;

        const storagePct = bt.includes("_storage")
          ? getBenchAddonPct(pricingItems, "12", "storage")
          : 0;

        const addonPct = backPct || storagePct || 0;

        unitCost = baseBenchLf * (1 + addonPct / 100);

        tooltip =
          addonPct > 0
            ? `${prettyType}: $${unitCost.toFixed(
                2
              )}/lf = base $${baseBenchLf.toFixed(2)} × (1 + ${addonPct}%)`
            : `${prettyType}: $${unitCost.toFixed(
                2
              )}/lf = base $${baseBenchLf.toFixed(2)}`;
      }

      const lineBase = unitCost * qtyLf;

      return {
        ...row,
        qty: qtyLf,
        picked: pickedBench as any,
        unitCost,
        lineBase,
        unitLabel: "lf",
        unit: "lf",
        tooltip,
        isFixedPrice: false,
        displayName: prettyType,
      };
    }
    // ----------------------------
    // ✅ STAIR OPTIONS (Add Item) — SAME pricing as MAIN stairs
    // Base comes from category "stair" matching selectedDecking.name
    // Option comes from the selected stair_options row (multiplier / addon_lf / lf)
    // ----------------------------
    if (normalizeCat(row.category || "") === "stair_options") {
      const qtyLf = Number(row.qty || 0);

      // row "Type" selection (this is a stair_options row)
      const stairOptionRow = pricingItems.find(
        (p) => String(p.id) === String(row.itemId)
      ) as PricingItemRow | undefined;

      const stairsCalc = computeEffectiveStairsRate({
        pricingItems,
        selectedDecking,
        stairOptionRow: stairOptionRow || null,
      });

      const unitCost = stairsCalc.effectiveRate;
      const lineBase = unitCost * qtyLf;

      return {
        ...row,
        qty: qtyLf,
        picked: {
          name: (stairOptionRow?.name || "Stair Option").toString(),
        } as any,
        unitCost: unitCost,
        lineBase: lineBase,
        unitLabel: "lf",
        unit: "lf",
        tooltip: stairsCalc.tooltip,
        isFixedPrice: false,
        displayName: (stairOptionRow?.name || "Stair Option").toString(),
      };
    }

    // ----------------------------
    // 3) If no type picked yet, return a safe row (prevents null crash)
    // ----------------------------
    if (!picked) {
      const qtySafe = Number(row.qty || 0);
      return {
        ...row,
        qty: qtySafe,
        picked: null,
        unitCost: 0,
        lineBase: 0,
        unitLabel: "",
        unit: "",
        tooltip: row.category ? "Select Type" : "Select Category",
        isFixedPrice: false,
        displayName: "",
      };
    }

    // ----------------------------
    // ----------------------------
    // 4) Default pricing
    // ----------------------------
    const qty = Number(row.qty || 0);
    const rawUnitCost = Number((picked as any).cost || 0);

    const pickedUnit = ((picked as any).unit || "").toLowerCase().trim();

    /* 👆👆👆 END STEP 3 👆👆👆 */

    const isPlanter = pickedName.includes("planter");
    const isRamp = pickedName.includes("ramp");

    // bases
    const baseDeckSf = selectedDecking?.cost ?? 0; // selected decking $/sf
    const baseRailLf = selectedRailing?.cost ?? 0; // selected railing $/lf

    // Keep EXACTLY the same behavior you already have for decking + railing.
    // Only change: make "stair options" in Add Item correctly reference the main Stairs base price.

    const referencesDecking =
      rowCat.includes("deck") ||
      rowCat === "decking_options" ||
      rowCat === "bench" ||
      pickedNameLc.includes("deck") ||
      pickedNameLc.includes("stair landing") ||
      pickedNameLc.includes("diagonal") ||
      pickedNameLc.includes("picture frame") ||
      pickedNameLc.includes("pic frame") ||
      pickedNameLc.includes("planter") ||
      pickedNameLc.includes("ramp") ||
      pickedNameLc.includes("board over board");

    // ✅ Stairs (Add Item) should price off the selected *main stairs* selection.
    // - Includes the stair_options category
    // - Includes tread/riser add-ons
    // - Includes "stair" in name, but avoids stair landing (which is decking-based)
    const referencesStairs =
      rowCat === "stair_options" ||
      rowCat.includes("stair") ||
      pickedNameLc.includes("tread") ||
      pickedNameLc.includes("riser") ||
      (pickedNameLc.includes("stair") && !pickedNameLc.includes("landing"));

    const referencesRailing =
      rowCat.includes("rail") ||
      pickedNameLc.includes("rail") ||
      pickedNameLc.includes("baluster");

    // ----------------------------
    // 5) PIC FRAME BORDER (LF) = 0.75 × selected decking $/sf
    // ----------------------------
    const isPicFrameBorder =
      pickedName.includes("pic frame") ||
      pickedName.includes("picture frame") ||
      pickedName.includes("picframe");

    if (isPicFrameBorder) {
      if (!selectedDecking || baseDeckSf <= 0) {
        displayUnitCost = 0;
        lineBase = 0;
        tooltip = "Select Decking Type to price picture frame";
      } else {
        displayUnitCost = baseDeckSf * 0.75;
        lineBase = displayUnitCost * qty;
        tooltip = `Pic Frame Border: $${displayUnitCost.toFixed(
          2
        )}/lf (0.75 × $${baseDeckSf.toFixed(2)}/sf)`;
      }
    }
    // ✅ PLANTER (LF) = 0.90 × selected decking $/sf
    if (isPlanter) {
      if (!selectedDecking || baseDeckSf <= 0) {
        displayUnitCost = 0;
        lineBase = 0;
        tooltip = "Select Decking Type to price planter";
      } else {
        displayUnitCost = baseDeckSf * 0.9;
        lineBase = displayUnitCost * qty;
        tooltip = `Planter: $${displayUnitCost.toFixed(
          2
        )}/lf (0.90 × $${baseDeckSf.toFixed(2)}/sf)`;
      }
    }
    // ✅ RAMP (SF) = (picked multiplier) × selected decking $/sf
    if (isRamp) {
      if (!selectedDecking || baseDeckSf <= 0) {
        displayUnitCost = 0;
        lineBase = 0;
        tooltip = "Select Decking Type to price ramp";
      } else {
        const mult = Number((picked as any).cost || 0); // Ramp sf row cost (multiplier)
        displayUnitCost = baseDeckSf * mult;
        lineBase = displayUnitCost * qty;
        tooltip = `Ramp: $${displayUnitCost.toFixed(2)}/sf (${mult.toFixed(
          2
        )} × $${baseDeckSf.toFixed(2)}/sf)`;
      }
    }

    // ----------------------------
    if (
      pickedUnit === "multiplier" &&
      rowCat !== "bench" &&
      rowCat !== "stair_options" &&
      !isPicFrameBorder &&
      !isPlanter &&
      !isRamp
    ) {
      const base =
        referencesRailing && baseRailLf > 0
          ? baseRailLf
          : referencesDecking && baseDeckSf > 0
          ? baseDeckSf
          : 0;

      if (base <= 0) {
        displayUnitCost = 0;
        lineBase = 0;
        tooltip = referencesRailing
          ? "Select Railing Type to price this item"
          : "Select Decking Type to price this item";
      } else {
        const mult = Number((picked as any).cost || 0);
        displayUnitCost = base * mult;
        lineBase = displayUnitCost * qty;
        tooltip = `multiplier ${mult.toFixed(2)} × base $${base.toFixed(
          2
        )} = $${displayUnitCost.toFixed(2)} per unit`;
      }
    }

    // ----------------------------
    // 8) addon_lf / addon_sf items (base + add)
    //    IMPORTANT: don't run this for bench (bench has its own rules)
    // ----------------------------
    if (
      (pickedUnit === "addon_lf" || pickedUnit === "addon_sf") &&
      rowCat !== "bench"
    ) {
      const base =
        referencesRailing && baseRailLf > 0
          ? baseRailLf
          : referencesDecking && baseDeckSf > 0
          ? baseDeckSf
          : 0;

      if (base <= 0) {
        displayUnitCost = 0;
        lineBase = 0;
        tooltip = referencesRailing
          ? "Select Railing Type to price this item"
          : "Select Decking Type to price this item";
      } else {
        const add = Number((picked as any).cost || 0);
        displayUnitCost = base + add;
        lineBase = displayUnitCost * qty;
        tooltip = `base $${base.toFixed(2)} + add $${add.toFixed(
          2
        )} = $${displayUnitCost.toFixed(2)}`;
      }
    }
    // ----------------------------
    // ✅ DEFAULT pricing fallback for NORMAL Add Items
    // If no special rule set a unit cost, use the picked row's cost.
    // ----------------------------
    if (displayUnitCost === 0) {
      const fallback = Number((picked as any)?.cost ?? 0);
      displayUnitCost = Number.isFinite(fallback) ? fallback : 0;
      lineBase = displayUnitCost * qty;

      if (!tooltip) {
        tooltip = `unit $${displayUnitCost.toFixed(
          2
        )} × qty ${qty} = $${lineBase.toFixed(2)}`;
      }
    }

    return {
      ...row,
      qty,
      picked: { ...(picked as any), name: pickedNameRaw } as any,
      unitCost: displayUnitCost,
      lineBase,
      unitLabel: (picked as any)?.unit || "ea",
      unit: (picked as any)?.unit || "ea",
      tooltip,
      isFixedPrice: false,
      displayName: pickedNameRaw,
    };
  });

  const addItemsSubtotalUpliftable = addItemsDetailed.reduce(
    (sum: number, r: any) => sum + (!r.isFixedPrice ? r.lineBase || 0 : 0),
    0
  );
  const addItemsSubtotalFixed = addItemsDetailed.reduce(
    (sum: number, r: any) => sum + (r.isFixedPrice ? r.lineBase || 0 : 0),
    0
  );

  // MARK DIRTY
  useEffect(() => {
    markDirty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    clientTitle,
    clientLastName,
    clientTown,
    clientEmail,
    constructionType,
    includePermit,
    msrpMode,
    selectedDeckingId,
    deckingSqFt,
    selectedRailingId,
    railingLf,
    selectedStairsId,
    stairsCount,
    selectedFastenerId,
    selectedDemoId,
    demoQty,
    skirtingCategory,
    selectedSkirtingId,
    skirtingSf,
    miValue,
    JSON.stringify(addItems),
  ]);

  // ===============================
  // UPLIFTS
  // ===============================
  const baseProjectTotal =
    deckingSubtotal +
    railingSubtotal +
    stairsSubtotal +
    fastenerSubtotal +
    demoSubtotal +
    skirtingSubtotal +
    addItemsSubtotalUpliftable;

  const financeRow = pricingItems.find(
    (row) => row.unit === "global_multiplier" && row.name === "Finance"
  );
  const perceivedRow = pricingItems.find(
    (row) => row.unit === "global_multiplier" && row.name === "Perceived Value"
  );

  const financeMultiplier = financeRow?.cost ?? 1;
  const perceivedMultiplier = perceivedRow?.cost ?? 1;

  const permitTier = includePermit
    ? getPermitTierForTotal(pricingItems, baseProjectTotal)
    : { multiplier: 1, threshold: null };
  const permitMultiplier = permitTier.multiplier;
  const permitThreshold = permitTier.threshold;

  const smallTier = getSmallJobTierForTotal(pricingItems, baseProjectTotal) ?? {
    multiplier: 1,
    threshold: null,
  };
  const smallProjectMultiplier =
    baseProjectTotal > 0 ? smallTier.multiplier : 1;

  const rawFinancePercent = (financeMultiplier - 1) * 100;
  const rawPerceivedPercent = (perceivedMultiplier - 1) * 100;

  const financePercent = msrpMode ? 0 : rawFinancePercent;
  const perceivedPercent = msrpMode ? 0 : rawPerceivedPercent;

  const miPercent = miValue || 0;

  const smallJobPercent = (smallProjectMultiplier - 1) * 100;
  const permitPercent = (permitMultiplier - 1) * 100;

  const totalUpliftPercent =
    financePercent +
    perceivedPercent +
    miPercent +
    smallJobPercent +
    permitPercent;

  const upliftMultiplier = 1 + totalUpliftPercent / 100;
    const upliftBreakdown = useMemo(() => {
    const money0 = (n: number) =>
      (n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

    const basePrice =
      (Number(deckingSubtotal) || 0) +
      (Number(railingSubtotal) || 0) +
      (Number(stairsSubtotal) || 0) +
      (Number(fastenerSubtotal) || 0) +
      (Number(demoSubtotal) || 0) +
      (Number(skirtingSubtotal) || 0) +
      (addItemsDetailed as any[])
        .filter((r) => r && r.picked && Number(r.lineBase || 0) !== 0)
        .reduce((sum, r) => sum + (Number(r.lineBase) || 0), 0);

    const permitAmt = (basePrice * (Number(permitPercent) || 0)) / 100;
    const smallJobAmt = (basePrice * (Number(smallJobPercent) || 0)) / 100;
    const msrp = basePrice + permitAmt + smallJobAmt;

        const perceivedAmt = (basePrice * (Number(perceivedPercent) || 0)) / 100;
    const financeAmt = (basePrice * (Number(financePercent) || 0)) / 100;
    const miAmt = (basePrice * (Number(miPercent) || 0)) / 100;
    const upliftSubtotal = perceivedAmt + financeAmt + miAmt;
    const totalCost = msrp + perceivedAmt + financeAmt + miAmt;

    const r0 = (n: number) => Math.round(Number(n) || 0);

    return {
      money0,
           basePrice: r0(basePrice),
      permitAmt: r0(permitAmt),
      smallJobAmt: r0(smallJobAmt),
      msrp: r0(msrp),
      perceivedAmt: r0(perceivedAmt),
      financeAmt: r0(financeAmt),
      miAmt: r0(miAmt),
      upliftSubtotal: r0(upliftSubtotal),
      totalCost: r0(totalCost),

    };
  }, [
    deckingSubtotal,
    railingSubtotal,
    stairsSubtotal,
    fastenerSubtotal,
    demoSubtotal,
    skirtingSubtotal,
    addItemsDetailed,
    permitPercent,
    smallJobPercent,
    perceivedPercent,
    financePercent,
    miPercent,
  ]);
// ===============================
// Trex Decking Price Levels (what-if totals)
// Only swaps the decking unit price; keeps the rest identical.
// ===============================


  const totalUpliftDollars =
    baseProjectTotal > 0 ? (baseProjectTotal * totalUpliftPercent) / 100 : 0;
  const financeUpliftDollars =
    baseProjectTotal > 0 ? (baseProjectTotal * financePercent) / 100 : 0;
  const perceivedUpliftDollars =
    baseProjectTotal > 0 ? (baseProjectTotal * perceivedPercent) / 100 : 0;
  const miUpliftDollars =
    baseProjectTotal > 0 ? (baseProjectTotal * miPercent) / 100 : 0;
  const permitUpliftDollars =
    baseProjectTotal > 0 ? (baseProjectTotal * permitPercent) / 100 : 0;
  const smallJobUpliftDollars =
    baseProjectTotal > 0 ? (baseProjectTotal * smallJobPercent) / 100 : 0;

  const projectTotalWithUplift =
    baseProjectTotal > 0 ? baseProjectTotal * upliftMultiplier : 0;
  const finalEstimate = projectTotalWithUplift + addItemsSubtotalFixed;
  const trexLevelsWhatIf = useMemo(() => {
 const LEVELS = [
  "Trex Enhance Basics",
  "Trex Enhance Naturals",
  "Trex Select",
  "Trex Transcend",
  "Trex Lineage",
  "Trex Signature",
] as const;


  const curName = (selectedDecking?.name || "").toString();
  const isTrex = curName.toLowerCase().includes("trex");
  if (!isTrex) return null;

  const fmt0 = (n: number) =>
    (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

  const curFinal = Number(finalEstimate) || 0;

  // If we don’t have enough info yet, return rows with blanks
  const safeBaseProjectTotal = Number(baseProjectTotal) || 0;
  const safeDeckingSubtotal = Number(deckingSubtotal) || 0;
const safeSkirtingSubtotal = Number(skirtingSubtotal) || 0;
const safeSkirtingSf = Number(skirtingSf ?? 0) || 0;
  const safeUpliftMultiplier = Number(upliftMultiplier) || 0;
  const safeFixed = Number(addItemsSubtotalFixed) || 0;
  const safeSqFt = Number(deckingSqFt) || 0;
  const safeConstructionAdj = Number(constructionAdj) || 0;

  // We need sq ft and multipliers to compute anything meaningful
  const canCompute =
    safeSqFt > 0 && safeUpliftMultiplier > 0 && safeBaseProjectTotal >= 0;

  // Helper: find the pricing item row for a given Trex level name
const findTrexRow = (levelName: string) => {
  const DECK_CATS = new Set(["decking", "composite_decking", "ipe"]);

  const currentCat = String((selectedDecking as any)?.category || "")
    .toLowerCase()
    .trim();

  const preferredCat = currentCat && DECK_CATS.has(currentCat) ? currentCat : null;

  const curName = (selectedDecking?.name || "").toString().toLowerCase();

  // Try to carry over “profile keywords” so we pick the comparable item
  // (ex: “grooved”, “square edge”, “scalloped”, “flat top”, etc.)
  const KEYWORDS = [
    "grooved",
    "square",
    "square edge",
    "scalloped",
    "flat top",
    "solid",
    "boards",
    "plank",
    "edge",
  ];

  const curKw = KEYWORDS.filter((k) => curName.includes(k));

  const needleExact = levelName.toLowerCase().trim();          // "trex enhance"
const needleLoose = needleExact.replace(/^trex\s+/, "");     // "enhance"
const mustContain = needleLoose;                             // force level keyword


  // Collect candidates (decking categories only)
  const candidates = pricingItems.filter((it) => {
    if (it.active === false) return false;
    if ((it.deleted_at ?? null) != null) return false;

    const cat = String((it as any).category || "").toLowerCase().trim();
    if (!DECK_CATS.has(cat)) return false;

    const nm = (it.name || "").toString().trim().toLowerCase();

   // Must be a Trex row AND must contain the specific level keyword ("basics", "enhance", etc.)
if (!nm.includes("trex")) return false;
if (!nm.includes(mustContain)) return false;

// Exact match or contains the full "trex <level>" phrase
if (nm === needleExact) return true;
if (nm.includes(needleExact)) return true;

// Otherwise allow it if it clearly matches the level keyword (already enforced above)
return true;

  });

  if (candidates.length === 0) return undefined;

  // Prefer same category as selected decking
  let pool = candidates;
  if (preferredCat) {
    const sameCat = candidates.filter(
      (it) =>
        String((it as any).category || "").toLowerCase().trim() === preferredCat
    );
    if (sameCat.length > 0) pool = sameCat;
  }

  // Score candidates: more keyword overlap wins, shorter name wins (more “base”)
  const score = (it: any) => {
    const nm = (it.name || "").toString().toLowerCase();
    const kwHits = curKw.reduce((s, k) => s + (nm.includes(k) ? 1 : 0), 0);
    const lengthPenalty = Math.min(nm.length / 100, 2); // small penalty for super long names
    return kwHits * 10 - lengthPenalty;
  };

  pool.sort((a, b) => score(b) - score(a));
  return pool[0];
};



  const rows = LEVELS.map((level) => {
    const row = findTrexRow(level);
    const altBaseDeckingUnit = Number((row as any)?.cost || 0);

    if (!canCompute || altBaseDeckingUnit <= 0) {
      return {
        level,
        total: null as number | null,
        diff: null as number | null,
        labelTotal: "—",
        labelDiff: "—",
      };
    }

    const altAdjustedDeckingUnit = altBaseDeckingUnit + safeConstructionAdj;
    const altDeckingSubtotal = altAdjustedDeckingUnit * safeSqFt;
    // Recompute skirting using THIS decking level (skirting is keyed off selectedDecking cost)
const simSkirtingCalc = computeEffectiveSkirtingRate({
  selectedDeckingUnit: altAdjustedDeckingUnit,
skirtingRow: selectedSkirting || undefined,
});

const simSkirtingRate = Number(simSkirtingCalc.effectiveRate) || 0;
const simSkirtingSubtotal = simSkirtingRate * safeSkirtingSf;

// Recompute stairs using THIS decking level (stairs are keyed off selectedDecking.name)
const altStairsCalc = computeEffectiveStairsRate({
  pricingItems,
  selectedDecking: row as any, // this Trex level row
  stairOptionRow: selectedStairOption || null,
});

const altStairsSubtotal =
  (Number(altStairsCalc.effectiveRate) || 0) * (Number(stairsCount ?? 0) || 0);
  // Recompute ONLY the deck-based Add Items using this decking level cost.
// (This makes the panel match what happens when you change the main decking dropdown.)
const curDeckSf = Number(selectedDecking?.cost || 0);
const altDeckSf = Number((row as any)?.cost || 0);

const altAddItemsSubtotalUpliftable = (addItemsDetailed as any[])
  .filter((r) => r && r.picked && !r.isFixedPrice && Number(r.lineBase || 0) !== 0)
  .reduce((sum, r) => {
    const qty = Number(r.qty || 0);
    if (qty <= 0) return sum;

    const picked = r.picked || {};
    const pickedUnit = String(picked.unit || r.unit || r.unitLabel || "")
      .toLowerCase()
      .trim();

    const nameLc = String(r.displayName || picked.name || "").toLowerCase();
    const catLc = String(r.category || "").toLowerCase();

    const isPicFrame =
      nameLc.includes("pic frame") ||
      nameLc.includes("picture frame") ||
      nameLc.includes("picframe");

    const isPlanter = nameLc.includes("planter");
    const isRamp = nameLc.includes("ramp");

    const referencesDecking =
      catLc.includes("deck") ||
      catLc === "decking_options" ||
      nameLc.includes("deck") ||
      nameLc.includes("stair landing") ||
      nameLc.includes("diagonal") ||
      nameLc.includes("picture frame") ||
      nameLc.includes("pic frame") ||
      nameLc.includes("planter") ||
      nameLc.includes("ramp") ||
      nameLc.includes("board over board");

    // if this add-item doesn't depend on decking, keep its existing lineBase
    if (!referencesDecking) return sum + (Number(r.lineBase) || 0);

    // If we don't have deck $/sf data, fall back safely to existing lineBase
    if (!(curDeckSf > 0 && altDeckSf > 0)) return sum + (Number(r.lineBase) || 0);

    // Mirror your exact add-item rules for deck-based items:
    const pickedCost = Number(picked.cost || 0);

    // Pic Frame Border: 0.75 × decking $/sf
    if (isPicFrame) {
      const unitCost = altDeckSf * 0.75;
      return sum + unitCost * qty;
    }

    // Planter: 0.90 × decking $/sf
    if (isPlanter) {
      const unitCost = altDeckSf * 0.9;
      return sum + unitCost * qty;
    }

    // Ramp: (picked multiplier) × decking $/sf
    if (isRamp) {
      const mult = pickedCost;
      const unitCost = altDeckSf * mult;
      return sum + unitCost * qty;
    }

    // multiplier: base × mult
    if (pickedUnit === "multiplier") {
      const unitCost = altDeckSf * pickedCost;
      return sum + unitCost * qty;
    }

    // addon_sf / addon_lf: base + add
    if (pickedUnit === "addon_sf" || pickedUnit === "addon_lf") {
      const unitCost = altDeckSf + pickedCost;
      return sum + unitCost * qty;
    }

    // Default deck-based fallback: scale linearly with decking cost
    // (keeps behavior stable for any other deck-tied lines)
    const scaled = (Number(r.lineBase) || 0) * (altDeckSf / curDeckSf);
    return sum + scaled;
  }, 0);

const altBaseTotal =
  safeBaseProjectTotal -
  safeDeckingSubtotal -
  safeSkirtingSubtotal -
  (Number(stairsSubtotal) || 0) -
  (Number(addItemsSubtotalUpliftable) || 0) +
  altDeckingSubtotal +
  simSkirtingSubtotal +
  altStairsSubtotal +
  altAddItemsSubtotalUpliftable;



    const altFinal = altBaseTotal * safeUpliftMultiplier + safeFixed;
    const diff = altFinal - curFinal;

    const diffLabel =
      diff === 0
        ? "$0"
        : diff > 0
        ? `+$${fmt0(diff)}`
        : `-$${fmt0(Math.abs(diff))}`;

    return {
      level,
      total: altFinal,
      diff,
      labelTotal: `$${fmt0(altFinal)}`,
      labelDiff: diffLabel,
    };
  });

  // Identify the “current level” row by name match
  const curLevel = LEVELS.find((lvl) =>
    curName.toLowerCase().includes(lvl.toLowerCase().replace("trex ", ""))
  );

  return { rows, curLevel };
}, [
  pricingItems,
  selectedDecking,
  finalEstimate,
  baseProjectTotal,
  deckingSubtotal,
  upliftMultiplier,
  addItemsSubtotalFixed,
    addItemsDetailed,
  addItemsSubtotalUpliftable,
  deckingSqFt,
  constructionAdj,
  selectedStairOption,
  stairsCount,
  stairsSubtotal,
    skirtingSubtotal,
  selectedSkirting,
  skirtingSf,

]);


  const prettyCat = (cat: string) =>
    (cat || "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  function getBenchAddonPct(
    pricingItems: PricingItemRow[],
    size: "12" | "18",
    kind: "back" | "storage"
  ) {
    const wantCat = size === "18" ? "bench_18in" : "bench";
    const wantNeedle = kind === "back" ? "w back" : "w storage";

    const row = pricingItems.find((it) => {
      if (it.active === false) return false;
      if ((it.deleted_at ?? null) != null) return false;

      const cat = String(it.category || "")
        .toLowerCase()
        .trim();
      if (normalizeCat(cat) !== wantCat) return false;

      // these rows are your add-on percent rows in Supabase
      const nm = String(it.name || "").toLowerCase();
      return nm.includes(wantNeedle);
    });

    const pct = Number(row?.cost || 0);
    return Number.isFinite(pct) ? pct : 0;
  }

  const catItemLabel = (cat: string, item: string) => {
    const c = prettyCat(cat);
    const i = (item || "").trim();
    if (!c) return i || "";
    if (!i) return c;
    return `${c} — ${i}`;
  };

  // ===============================
  // RENDER
  // ===============================
  return (
    <div className="app-shell">
      {/* hidden open input */}
      <input
        ref={openFileInputRef}
        type="file"
        accept=".json,.DUest,.duest"
        style={{ display: "none" }}
        onChange={onPickOpenFile}
      />

      {/* LEFT SIDEBAR */}
      <aside className="sidebar-left">
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">DU</div>
          <div className="sidebar-logo-text">
            <div className="sidebar-logo-title">Deck Estimator</div>
            <div className="sidebar-logo-subtitle">Decks Unique</div>
          </div>
        </div>

        <div className="sidebar-file">
          <button
            type="button"
            className={`sidebar-nav-item sidebar-file-trigger ${
              fileOpen ? "is-open" : ""
            }`}
            onClick={() => setFileOpen((v) => !v)}
          >
            <span className="sidebar-nav-dot" />
            <span className="sidebar-file-label">File</span>

            <span className="sidebar-file-caret">{fileOpen ? "▾" : "▸"}</span>
          </button>

          {fileOpen && (
            <div className="sidebar-file-menu">
              <button
                type="button"
                className="sidebar-file-item"
                onClick={() => {
                  setFileOpen(false);
                  requestNewProject();
                }}
              >
                New
              </button>

              <button
                type="button"
                className="sidebar-file-item"
                onClick={() => {
                  handleFileOpen();
                  setTimeout(() => setFileOpen(false), 0);
                }}
              >
                Open…
              </button>

              <button
                type="button"
                className="sidebar-file-item"
                onClick={() => {
                  refreshRecents();
                  setRecentOpen((v) => !v);
                }}
              >
                Open Recent {recentOpen ? "▾" : "▸"}
              </button>

              {recentOpen && (
                <div
                  style={{ paddingLeft: 10, paddingTop: 6, paddingBottom: 6 }}
                >
                  {recentFiles.length === 0 ? (
                    <div
                      style={{
                        fontSize: 12,
                        opacity: 0.7,
                        padding: "6px 10px",
                      }}
                    >
                      No recent files yet.
                    </div>
                  ) : (
                    recentFiles.map((rf) => (
                      <button
                        key={rf.ts + rf.name}
                        type="button"
                        className="sidebar-file-item"
                        style={{ fontSize: 12, opacity: 0.95 }}
                        onClick={() => openRecent(rf)}
                        title={new Date(rf.ts).toLocaleString()}
                      >
                        {rf.name}
                      </button>
                    ))
                  )}

                  {recentFiles.length > 0 && (
                    <button
                      type="button"
                      className="sidebar-file-item"
                      style={{ fontSize: 12, opacity: 0.8 }}
                      onClick={() => {
                        localStorage.removeItem(RECENTS_KEY);
                        refreshRecents();
                        setRecentOpen(false);
                      }}
                    >
                      Clear Recent
                    </button>
                  )}
                </div>
              )}

              {/* SAVE */}
              <button
                type="button"
                className="sidebar-file-item"
                onClick={() => {
                  handleFileSave();
                  setFileOpen(false);
                }}
              >
                Save
              </button>

              {/* SAVE AS */}
              <button
                type="button"
                className="sidebar-file-item"
                onClick={() => {
                  handleFileSaveAs();
                  setFileOpen(false);
                }}
              >
                Save As…
              </button>

              <button
                type="button"
                className="sidebar-file-item"
                onClick={() => {
                  setFileOpen(false);
                  onLogout();
                }}
              >
                Log out
              </button>
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          <SidebarNavItem
            label="Estimator"
            isActive={activeNav === "estimator"}
            onClick={() => setActiveNav("estimator")}
          />
          <SidebarNavItem
            label="Proposals"
            isActive={activeNav === "proposals"}
            onClick={() => setActiveNav("proposals")}
          />
<SidebarNavItem
  label="Contract"
  isActive={activeNav === "contract"}
  onClick={() => setActiveNav("contract")}
/>

          {canEditPricing && (
            <SidebarNavItem
              label="Pricing Admin"
              isActive={activeNav === "pricingAdmin"}
              onClick={() => setActiveNav("pricingAdmin")}
            />
          )}

          <SidebarNavItem
            label="Analytics"
            isActive={activeNav === "analytics"}
            onClick={() => setActiveNav("analytics")}
          />
          <SidebarNavItem
            label="Settings"
            isActive={activeNav === "settings"}
            onClick={() => setActiveNav("settings")}
          />

          {canSeeUsersLicenses && (
            <SidebarNavItem
              label="Users / Licenses"
              isActive={activeNav === "users"}
              onClick={() => setActiveNav("users")}
            />
          )}
        </nav>

        {/* Offline indicator (sidebar) */}
        {(!isOnline ||
          (pricingError || "").toLowerCase().includes("offline mode")) && (
          <div className="sidebar-offline">
            <span className="sidebar-offline-dot" />
            Offline Mode
          </div>
        )}

        <div className="sidebar-footer">
          <div className="sidebar-footer-title">Estimator2.0</div>
          <div className="sidebar-footer-version">v{DEPLOY_VERSION}</div>
        </div>
        {/* ROLE LABEL (bottom of sidebar) */}
        <div
          style={{
            marginTop: 16,
            padding: "12px 12px",
            fontSize: 12,
            opacity: 0.8,
            borderTop: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <div style={{ fontWeight: 800 }}>{isAdmin ? "Admin" : "User"}</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>{userEmail}</div>
        </div>
      </aside>

      <main
        className={
          "main-content " +
          (activeNav === "pricingAdmin" ? "main-content--full" : "")
        }
      >
        {/* PAGE HEADER (Joist-style) */}
        <header className="page-header">
          <div className="page-header__left">
            <div className="page-header__title">
              {activeNav === "estimator" && "Deck Estimate"}
              {activeNav === "proposals" && "Proposals"}
              {activeNav === "pricingAdmin" && "Pricing Administration"}
              {activeNav === "analytics" && "Analytics"}
              {activeNav === "settings" && "Settings"}
              {activeNav === "users" && "Users / Licenses"}
              {activeNav === "contract" && "Contract (Page Under Construction)"}

            </div>

            <div className="page-header__subtitle">
              {activeNav === "estimator" &&
                "Build an estimate and generate a proposal"}
            </div>
          </div>
        </header>

        {toast && <div className="du-toast">{toast}</div>}

        <div
          className={
            "main-grid " +
            (activeNav === "analytics" ||
            activeNav === "proposals" ||
            activeNav === "settings"
              ? "main-grid--single "
              : "") +
            (activeNav === "pricingAdmin" ? "main-grid--pricing " : "")
          }
        >
          {activeNav === "analytics" && (
  <section className="analytics-page">
    <AnalyticsPage
      finalEstimate={finalEstimate}
      permitPercent={permitPercent}
      smallJobPercent={smallJobPercent}
      perceivedPercent={perceivedPercent}
      financePercent={financePercent}
      miPercent={miPercent}
      deckingSubtotal={deckingSubtotal}
      railingSubtotal={railingSubtotal}
      stairsSubtotal={stairsSubtotal}
      fastenerSubtotal={fastenerSubtotal}
      demoSubtotal={demoSubtotal}
      skirtingSubtotal={skirtingSubtotal}
      addItemsDetailed={addItemsDetailed}
    />
  </section>
)}

          {/* ====== USERS / LICENSES (ADMIN ONLY) ====== */}
          {activeNav === "users" &&
            (canSeeUsersLicenses ? (
              <section className="users-licenses-page">
                <UsersLicensesPage orgId={orgId} />
              </section>
            ) : (
              <section style={{ padding: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>
                  Not authorized
                </div>
                <div style={{ opacity: 0.75, marginTop: 6 }}>
                  You don’t have permission to view Users / Licenses.
                </div>
              </section>
            ))}

          {/* ====== ESTIMATOR ====== */}
          {activeNav === "estimator" && (
            <section className="estimator-pane">
              <div>
                {!pricingLoaded && !pricingError && (
                  <div className="banner banner-info">
                    Loading pricing from Supabase…
                  </div>
                )}

                {pricingLoaded && (
                  <>
                    {/* ===== UPLIFT / MSRP ROW ===== */}
                    <div className="msrp-pill-row">
                      {/* Left: MSRP toggle pill */}
                      <span
                        className={`pill pill--uplift msrp-pill ${
                          msrpMode ? "on" : "off"
                        }`}
                        onClick={() => setMsrpMode(!msrpMode)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setMsrpMode(!msrpMode);
                          }
                        }}
                        aria-pressed={msrpMode}
                        title={
                          msrpMode
                            ? "MSRP mode ON (uplifts disabled)"
                            : "MSRP mode OFF"
                        }
                      />
                     
                    


                      {/* Right: Uplift multiplier pill (1.17) + hover breakdown */}
{(() => {
  const money0 = (n: number) =>
    (n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

  const basePrice =
    (Number(deckingSubtotal) || 0) +
    (Number(railingSubtotal) || 0) +
    (Number(stairsSubtotal) || 0) +
    (Number(fastenerSubtotal) || 0) +
    (Number(demoSubtotal) || 0) +
    (Number(skirtingSubtotal) || 0) +
    (addItemsDetailed as any[])
      .filter((r) => r && r.picked && Number(r.lineBase || 0) !== 0)
      .reduce((sum, r) => sum + (Number(r.lineBase) || 0), 0);

  const permitAmt = (basePrice * (Number(permitPercent) || 0)) / 100;
  const smallJobAmt = (basePrice * (Number(smallJobPercent) || 0)) / 100;
  const msrp = basePrice + permitAmt + smallJobAmt;

  const perceivedAmt = (msrp * (Number(perceivedPercent) || 0)) / 100;
  const financeAmt = (msrp * (Number(financePercent) || 0)) / 100;
  const miAmt = (msrp * (Number(miPercent) || 0)) / 100;
  const upliftSubtotal = perceivedAmt + financeAmt + miAmt;
  const totalCost = msrp + perceivedAmt + financeAmt + miAmt;

  return (
    <div className="pill-wrapper uplift-hover">
      <span className="pill pill--uplift">{upliftMultiplier.toFixed(2)}</span>

      <div className="uplift-hover-box">
  <div style={{ fontWeight: 800, marginBottom: 8 }}>Uplift Breakdown</div>

  <div style={{ fontWeight: 800, marginBottom: 6 }}>
    Base Price: ${upliftBreakdown.money0(upliftBreakdown.basePrice)}
  </div>

  <div>
    Permit: {Math.round(permitPercent)}% (${upliftBreakdown.money0(upliftBreakdown.permitAmt)})
  </div>
  <div>
    Small Job: {Math.round(smallJobPercent)}% (${upliftBreakdown.money0(upliftBreakdown.smallJobAmt)})
  </div>

  <div style={{ marginTop: 10, fontWeight: 800 }}>
    MSRP: ${upliftBreakdown.money0(upliftBreakdown.msrp)}
  </div>

  <div style={{ marginTop: 8 }}>
    Perceived Value: {Math.round(perceivedPercent)}% (${upliftBreakdown.money0(upliftBreakdown.perceivedAmt)})
  </div>
  <div>
    Finance: {Math.round(financePercent)}% (${upliftBreakdown.money0(upliftBreakdown.financeAmt)})
  </div>
  <div>
    Manual Index: {Math.round(miPercent)}% (${upliftBreakdown.money0(upliftBreakdown.miAmt)})
 <div style={{ marginTop: 4, fontStyle: "italic", opacity: 0.85 }}>
  Sub Total Uplift: ${upliftBreakdown.money0(upliftBreakdown.upliftSubtotal)}
</div>
  </div>

  <div style={{ marginTop: 10, fontWeight: 900 }}>
    Total Cost: ${upliftBreakdown.money0(upliftBreakdown.totalCost)}
  </div>
</div>

    </div>
  );
})()}


                    </div>

                    {/* ===== Client Info ===== */}
                    <section className="estimator-section estimator-section--no-bottom">
                      <div className="estimator-section-body">
                        <div className="client-info-row">
                          <div className="client-field">
                            <label>Title</label>
                            <select
                              value={clientTitle}
                              onChange={(e) => setClientTitle(e.target.value)}
                            >
                              <option value="">—</option>
                              <option value="Mr.">Mr.</option>
                              <option value="Mrs.">Mrs.</option>
                              <option value="Ms.">Ms.</option>
                              <option value="Dr.">Dr.</option>
                            </select>
                          </div>

                          <div className="client-field">
                            <label>Last Name</label>
                            <input
                              type="text"
                              value={clientLastName}
                              onChange={(e) =>
                                setClientLastName(e.target.value)
                              }
                              placeholder="Last name"
                            />
                          </div>

                          <div className="client-field">
                            <label>Location</label>
                            <input
                              type="text"
                              value={clientTown}
                              onChange={(e) => setClientTown(e.target.value)}
                              placeholder="Town / City"
                            />
                          </div>

                          <div
                            className="client-field"
                            style={{ position: "relative" }}
                          >
                            <label>Email</label>
                            <input
                              type="email"
                              value={clientEmail}
                              onChange={(e) => {
                                const v = e.target.value;
                                setClientEmail(v);
                                setEmailSugOpen(v.includes("@"));
                              }}
                              onFocus={() => {
                                if (clientEmail.includes("@"))
                                  setEmailSugOpen(true);
                              }}
                              onBlur={() => {
                                // let click register on a suggestion
                                window.setTimeout(
                                  () => setEmailSugOpen(false),
                                  120
                                );
                              }}
                              placeholder="Email"
                              autoComplete="off"
                            />

                            {emailSugOpen && emailSuggestions.length > 0 && (
                              <div className="email-suggest">
                                {emailSuggestions.map((s) => (
                                  <button
                                    key={s}
                                    type="button"
                                    className="email-suggest-item"
                                    onMouseDown={(e) => e.preventDefault()} // prevent blur before click
                                    onClick={() => {
                                      setClientEmail(s);
                                      setEmailSugOpen(false);
                                    }}
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* ===== Decking + Construction Type ===== */}
                    <section className="estimator-section">
                      <header className="estimator-section-header">
                        <div className="decking-header-row">
                          <div
                            className="form-field"
                            style={{ width: "260px" }}
                          >
                            <select
                              ref={constructionTypeRef}
                              className="form-select"
                              value={constructionType}
                              onChange={(e) =>
                                setConstructionType(e.target.value)
                              }
                            >
                              <option value="" disabled hidden>
                                Construction Type
                              </option>
                              {constructionOptions.map((opt) => (
                                <option key={opt.id} value={opt.name}>
                                  {opt.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="permit-control">
                            <span className="permit-title">Permit</span>
                            <button
                              type="button"
                              className={`permit-switch ${
                                includePermit ? "is-on" : "is-off"
                              }`}
                              onClick={() => setIncludePermit((v) => !v)}
                              aria-pressed={includePermit}
                            >
                              <span className="permit-switch-knob" />
                            </button>
                          </div>
                        </div>
                      </header>

                      <div className="estimator-section-body">
                        <div className="form-row form-row--4">
                          {/* Decking Type */}
                          <div className="form-field">
                            <select
                              className="form-select"
                              value={selectedDeckingId}
                              onChange={(e) =>
                                setSelectedDeckingId(e.target.value)
                              }
                            >
                              <option value="" disabled hidden>
                                Decking Type
                              </option>
                              {deckingOptions.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.name}
                                </option>
                              ))}
                            </select>
                          </div>


                          {/* MI */}
                          <div className="form-field">
                            <ExpressionNumberInput
                              className="form-input no-spinner mi-input"
                              placeholder="MI"
                              value={miValue}
                              onValueChange={setMiValue}
                              ariaLabel="Manual uplift index"
                            />
                          </div>

                          {/* SF + tooltip */}
                          <div className="tooltip-wrapper">
                            <ExpressionNumberInput
                              className="form-input no-spinner"
                              placeholder="SF"
                              value={deckingSqFt}
                              onValueChange={setDeckingSqFt}
                            />

                            <div className="tooltip-box">
                              <div>
                                Base decking: {baseDeckingUnit.toFixed(2)} / sf
                              </div>
                              <div>
                                Construction ({constructionType || "None"}):{" "}
                                {constructionAdj >= 0 ? "+" : ""}
                                {constructionAdj.toFixed(2)} / sf
                              </div>
                              <div
                                style={{ marginTop: "4px", fontWeight: 600 }}
                              >
                                Adjusted rate: {adjustedDeckingUnit.toFixed(2)}{" "}
                                / sf
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* ===== RAILING ===== */}
                    <section className="estimator-section">
                      <div className="estimator-section-body">
                        <div className="form-row form-row--3">
                          <div className="form-field">
                            <select
                              className="form-select"
                              value={selectedRailingId}
                              onChange={(e) =>
                                setSelectedRailingId(e.target.value)
                              }
                            >
                              <option value="" disabled hidden>
                                Railing Type
                              </option>
                              {railingOptions.map((opt) => (
                                <option key={opt.id} value={String(opt.id)}>
                                  {opt.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="tooltip-wrapper">
                            <ExpressionNumberInput
                              className="form-input no-spinner"
                              placeholder="LF"
                              value={railingLf}
                              onValueChange={setRailingLf}
                            />
                            <div className="tooltip-box">
                              <div>
                                {selectedRailing
                                  ? `${selectedRailing.name}`
                                  : "Select railing"}{" "}
                                · ${(baseRailingUnit || 0).toFixed(2)} / lf
                              </div>
                              <div style={{ marginTop: 4, fontWeight: 600 }}>
                                Subtotal: $
                                {railingSubtotal.toLocaleString(undefined, {
                                  maximumFractionDigits: 0,
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* ===== STAIRS ===== */}
                    <section className="estimator-section">
                      <div className="estimator-section-body">
                        <div className="form-row form-row--3">
                          <div className="form-field">
                            <select
                              className="form-select"
                              value={selectedStairsId}
                              onChange={(e) =>
                                setSelectedStairsId(e.target.value)
                              }
                            >
                              <option value="" disabled hidden>
                                Stair Options
                              </option>
                              {stairsOptions.map((opt) => (
                                <option key={opt.id} value={String(opt.id)}>
                                  {opt.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="tooltip-wrapper">
                            <ExpressionNumberInput
                              className="form-input no-spinner"
                              placeholder="lf of treads"
                              value={stairsCount}
                              onValueChange={setStairsCount}
                            />
                            <div className="tooltip-box">
                              <div>
                                Base: ${baseStairsUnit.toFixed(2)} · Effective:
                                ${effectiveStairsRate.toFixed(2)}
                              </div>
                              <div style={{ marginTop: 4, fontWeight: 600 }}>
                                Subtotal: $
                                {stairsSubtotal.toLocaleString(undefined, {
                                  maximumFractionDigits: 0,
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* ===== FASTENERS ===== */}
                    <section className="estimator-section">
                      <div className="estimator-section-body">
                        <div className="form-row form-row--3">
                          <div className="form-field">
                            <select
                              className="form-select"
                              value={selectedFastenerId}
                              onChange={(e) =>
                                setSelectedFastenerId(e.target.value)
                              }
                            >
                              <option value="" disabled hidden>
                                Fastener Type
                              </option>
                              {fastenerOptions.map((opt) => (
                                <option key={opt.id} value={String(opt.id)}>
                                  {opt.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="tooltip-wrapper">
                            <input
                              type="number"
                              className="form-input no-spinner"
                              placeholder="Auto Qty"
                              value={
                                fastenerQtyAuto === 0 ? "" : fastenerQtyAuto
                              }
                              readOnly
                            />
                            <div className="tooltip-box">
                              <div>
                                Auto qty = Decking SF ({deckingSqFt || 0})
                              </div>
                              <div>
                                Rate: ${baseFastenerUnit.toFixed(2)} / ea
                              </div>
                              <div style={{ marginTop: 4, fontWeight: 600 }}>
                                Subtotal: $
                                {fastenerSubtotal.toLocaleString(undefined, {
                                  maximumFractionDigits: 0,
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* ===== DEMOLITION ===== */}
                    <section className="estimator-section">
                      <div className="estimator-section-body">
                        <div className="form-row form-row--3">
                          <div className="form-field">
                            <select
                              className="form-select"
                              value={selectedDemoId}
                              onChange={(e) =>
                                setSelectedDemoId(e.target.value)
                              }
                            >
                              <option value="" disabled hidden>
                                Demo Type
                              </option>
                              {demoOptions.map((opt) => (
                                <option key={opt.id} value={String(opt.id)}>
                                  {opt.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="tooltip-wrapper">
                            <ExpressionNumberInput
                              className="form-input no-spinner"
                              placeholder="Qty"
                              value={demoQty}
                              onValueChange={setDemoQty}
                            />
                            <div className="tooltip-box">
                              <div>
                                Rate: ${baseDemoUnit.toFixed(2)} · Unit:{" "}
                                {selectedDemo?.unit || "ea"}
                              </div>
                              <div style={{ marginTop: 4, fontWeight: 600 }}>
                                Subtotal: $
                                {demoSubtotal.toLocaleString(undefined, {
                                  maximumFractionDigits: 0,
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* ===== SKIRTING / LATTICE ===== */}
                    <section className="estimator-section">
                      <div className="estimator-section-body">
                        <div className="form-row form-row--3">
                          <div className="form-field">
                            <select
                              ref={skirtingCategoryRef}
                              className="form-select"
                              value={skirtingCategory}
                              onChange={(e) => {
                                const next = e.target.value as
                                  | ""
                                  | "Skirting"
                                  | "Lattice";
                                setSkirtingCategory(next);

                                // reset skirting type when switching category
                                setSelectedSkirtingId("");
                                setSkirtingTypeTouched(false);
                              }}
                            >
                              <option value="" disabled hidden>
                                Skirting / Lattice
                              </option>
                              <option value="Skirting">Skirting</option>
                              <option value="Lattice">Lattice</option>
                            </select>
                          </div>

                          <div className="form-field">
                            <select
                              className="form-select"
                              value={selectedSkirtingId}
                              onChange={(e) => {
                                setSkirtingTypeTouched(true);
                                setSelectedSkirtingId(e.target.value);
                              }}
                              disabled={!skirtingCategory}
                            >
                              <option value="" disabled hidden>
                                Type
                              </option>
                              {skirtingLatticeOptions.map((opt) => (
                                <option key={opt.id} value={String(opt.id)}>
                                  {opt.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="tooltip-wrapper">
                            <ExpressionNumberInput
                              className="form-input no-spinner"
                              placeholder="SF"
                              value={skirtingSf}
                              onValueChange={setSkirtingSf}
                            />
                            <div className="tooltip-box">
                              <div>
Rate: ${(effectiveSkirtingRate || 0).toFixed(2)} / sf
                              </div>
                              <div style={{ marginTop: 4, fontWeight: 600 }}>
                                Subtotal: $
                                {skirtingSubtotal.toLocaleString(undefined, {
                                  maximumFractionDigits: 0,
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* ===== ADD ITEMS ===== */}
                    <div className="estimator-section-body">
                      <div className="add-items-header-row">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={addAddItemRow}
                        >
                          + Add Item
                        </button>
                      </div>

                      <div className="add-items-rows">
                        {addItemsDetailed.length === 0 ? (
                          <div className="section-placeholder">
                            Click <strong>+ Add Item</strong> to add benches,
                            lighting, columns, etc.
                          </div>
                        ) : (
                          addItemsDetailed.map((row: any) => {
                            const options = addItemOptionsForRow(row);

                            return (
                              <div
                                key={row.rowId}
                                className="add-item-row add-item-row--grid"
                              >
                                <div className="form-field">
                                  <select
                                    className="form-select"
                                    value={row.category || ""}
                                    onChange={(e) => {
                                      const nextCat = e.target.value;
                                      updateAddItemRow(row.rowId, {
                                        category: nextCat,
                                        itemId: "",
                                        qty: 0,
                                        customName: "",
                                        customPrice: 0,
                                        constructionType: "",
                                        deckingId: "",
                                        benchType:
                                          normalizeCat(nextCat) === "bench"
                                            ? "12_flat"
                                            : "",
                                      });
                                    }}
                                  >
                                    <option value="" disabled hidden>
                                      Category
                                    </option>

                                    {/* Normal Add Item categories */}
                                    {addItemCategories.map((cat) => (
                                      <option key={cat} value={cat}>
                                        {cat.replace(/_/g, " ")}
                                      </option>
                                    ))}

                                    {/* Divider */}
                                    <option disabled value="__divider__">
                                      ─────────────
                                    </option>

                                    {/* Construction Types at bottom */}
                                    {CONSTRUCTION_TYPES.filter(
                                      (t) => !!t.value
                                    ).map((t) => (
                                      <option key={t.value} value={t.value}>
                                        {t.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {isConstructionTypeCategory(
                                  row.category || ""
                                ) ? (
                                  <>
                                    <div className="form-field">
                                      <select
                                        className="form-select"
                                        value={row.deckingId || ""}
                                        onChange={(e) =>
                                          updateAddItemRow(row.rowId, {
                                            deckingId: e.target.value,
                                          })
                                        }
                                      >
                                        <option value="" disabled hidden>
                                          Decking Type
                                        </option>
                                        {deckingOptions.map((opt) => (
                                          <option
                                            key={opt.id}
                                            value={String(opt.id)}
                                          >
                                            {opt.name}
                                          </option>
                                        ))}
                                      </select>
                                    </div>

                                    <div
                                      className="additem-qty-wrap"
                                      data-tooltip={row.tooltip || ""}
                                    >
                                      <ExpressionNumberInput
                                        className="form-input no-spinner"
                                        placeholder="SF"
                                        value={row.qty || 0}
                                        onValueChange={(val) =>
                                          updateAddItemRow(row.rowId, {
                                            qty: val,
                                          })
                                        }
                                      />
                                      <button
                                        type="button"
                                        className="additem-remove"
                                        onClick={() =>
                                          removeAddItemRow(row.rowId)
                                        }
                                        aria-label="Remove item"
                                        title="Remove"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </>
) : normalizeCat(row.category || "") === "misc" ? (
  <>
    {/* Title (col 2) */}
    <div className="form-field">
      <input
        type="text"
        className="form-input"
        placeholder="Title (e.g., Screened Sunroom)"
        value={row.customName || ""}
        onChange={(e) =>
          updateAddItemRow(row.rowId, {
            customName: e.target.value,
            qty: 1,
          })
        }
      />
    </div>

    {/* Proposal Qty (col 3) */}
    <div className="form-field">
      <input
        type="text"
        className="form-input"
        placeholder="Proposal Qty (e.g., 400 sf)"
        value={(row as any).customQtyText || ""}
        onChange={(e) =>
          updateAddItemRow(
            row.rowId,
            { customQtyText: e.target.value, qty: 1 } as any
          )
        }
      />
    </div>

    {/* Remove X (col 4) — EXACTLY like other rows */}
    <button
      type="button"
      className="additem-remove"
      onClick={() => removeAddItemRow(row.rowId)}
      aria-label="Remove item"
      title="Remove"
    >
      ✕
    </button>

    {/* ---- second line (indented under Title/Qty) ---- */}

    {/* spacer (col 1) so the line starts under Title */}
    <div />

    {/* Proposal description (col 2-3) */}
    <div className="form-field" style={{ gridColumn: "2 / 3" }}>
      <input
        type="text"
        className="form-input"
        placeholder="Proposal description (optional)"
        value={row.customDescription || ""}
        onChange={(e) =>
          updateAddItemRow(row.rowId, {
            customDescription: e.target.value,
            qty: 1,
          })
        }
      />
    </div>

    {/* Price (col 3) */}
    <div className="form-field" style={{ gridColumn: "3 / 4" }}>
      <ExpressionNumberInput
        className="form-input no-spinner additem-qty-input"
        placeholder="$ Price"
        value={row.customPrice || 0}
        onValueChange={(val) =>
          updateAddItemRow(row.rowId, {
            customPrice: val,
            qty: 1,
          })
        }
      />
    </div>

    {/* empty col 4 to keep grid shape consistent */}
    <div />
  </>
) : (



                                  <>
                                    {normalizeCat(row.category || "") ===
                                    "bench" ? (
                                      <div className="form-field">
                                        <select
                                          className="form-select"
                                          value={row.benchType || "12_flat"}
                                          onChange={(e) => {
                                            const next = e.target.value;
                                            const benchLabel =
                                              BENCH_TYPES.find((x) => x.value === next)?.label || "";
                                            const deckName = (selectedDecking?.name || "").toString().trim();
                                            const deckNameLc = deckName.toLowerCase();

                                            const benchId = pricingItems.find((p) => {
                                              if (normalizeCat(p.category || "") !== "bench") return false;
                                              const name = String(p.name || "").trim();
                                              const nameLc = name.toLowerCase();

                                              // prefer bench row that includes selected decking name
                                              if (deckNameLc && !nameLc.includes(deckNameLc)) return false;

                                              return name === benchLabel;
                                            })?.id;

                                            updateAddItemRow(row.rowId, {
                                              benchType: next,
                                              itemId: benchId ? String(benchId) : "", // map to Pricing Admin bench row
                                            });
                                          }}
                                          disabled={!row.category}
                                        >
                                          <option value="" disabled hidden>
                                            Bench Type
                                          </option>

                                          {BENCH_TYPES.map((bt) => (
                                            <option
                                              key={bt.value}
                                              value={bt.value}
                                            >
                                              {bt.label}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    ) : (
                                      <div className="form-field">
                                        <select
                                          className="form-select"
                                          value={row.itemId}
                                          onChange={(e) =>
                                            updateAddItemRow(row.rowId, {
                                              itemId: e.target.value,
                                              customName: "",
                                              customPrice: 0,
                                              constructionType: "",
                                              deckingId: "",
                                            })
                                          }
                                          disabled={!row.category}
                                        >
                                          <option value="" disabled hidden>
                                            Type
                                          </option>

                                          {options.map((opt) => (
                                            <option
                                              key={opt.id}
                                              value={String(opt.id)}
                                            >
                                              {opt.name}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    )}

                                    <div
                                      className="additem-qty-wrap"
                                      data-tooltip={
                                        row.tooltip || "Enter quantity"
                                      }
                                    >
                                      <ExpressionNumberInput
                                        className="form-input no-spinner"
                                        placeholder="Qty"
                                        value={row.qty || 0}
                                        onValueChange={(val) =>
                                          updateAddItemRow(row.rowId, {
                                            qty: val,
                                          })
                                        }
                                      />
                                      <button
                                        type="button"
                                        className="additem-remove"
                                        onClick={() =>
                                          removeAddItemRow(row.rowId)
                                        }
                                        aria-label="Remove item"
                                        title="Remove"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>
          )}
          {activeNav === "pricingAdmin" &&
            (canEditPricing ? (
              <PricingAdmin readOnly={false} />
            ) : (
              <section style={{ padding: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>
                  Not authorized
                </div>
                <div style={{ opacity: 0.75, marginTop: 6 }}>
                  You don’t have permission to view Pricing Admin.
                </div>
              </section>
            ))}

          {activeNav === "settings" && (
            <SettingsPage
              userSettings={userSettings}
              setUserSettings={setUserSettings}
              orgId={orgId}
              isAdmin={isAdmin}
            />
          )}

         <div style={{ display: activeNav === "proposals" ? "block" : "none" }}>
            <ProposalPage
              orgId={orgId}
              proposalId={proposalId || undefined}
              constructionType={constructionType}
              userSettings={userSettings}
              estimateName={estimateName}
              finalEstimate={finalEstimate}
              clientTitle={clientTitle}
              clientLastName={clientLastName}
              clientTown={clientTown}
              clientEmail={clientEmail}
              deckingSubtotal={deckingSubtotal}
              railingSubtotal={railingSubtotal}
              stairsSubtotal={stairsSubtotal}
              fastenerSubtotal={fastenerSubtotal}
              demoSubtotal={demoSubtotal}
              skirtingSubtotal={skirtingSubtotal}
              deckingType={selectedDecking?.name || ""}
              railingType={selectedRailing?.name || ""}
              stairsType={selectedStairOption?.name || ""}
              fastenerType={selectedFastener?.name || ""}
              demoType={selectedDemo?.name || ""}
              skirtingType={selectedSkirting?.name || ""}
              deckingDescription={selectedDecking?.proposal_description || ""}
              railingDescription={selectedRailing?.proposal_description || ""}
              stairsDescription={
                selectedStairOption?.proposal_description || ""
              }
              fastenerDescription={selectedFastener?.proposal_description || ""}
              demoDescription={selectedDemo?.proposal_description || ""}
              skirtingDescription={selectedSkirting?.proposal_description || ""}
              deckingQty={deckingSqFt}
              deckingUnit="sf"
              railingQty={railingLf}
              railingUnit="lf"
              stairsQty={stairsCount ?? 0}
              stairsUnit="ea"
              fastenerQty={fastenerQtyAuto}
              fastenerUnit="ea"
              demoQty={demoQty}
              demoUnit="ea"
              skirtingQty={skirtingSf}
              skirtingUnit="sf"
              addItemsDetailed={addItemsDetailed as any}
              upliftMultiplier={upliftMultiplier}
              onEmailProposal={handleEmailProposal}
            />
          </div>
  
{activeNav === "contract" && (
  <ContractPage
    orgId={orgId}
    estimateId={estimateId}

    finalEstimate={finalEstimate}
    selectedDecking={selectedDecking}
    selectedRailing={selectedRailing}
    selectedStairOption={selectedStairOption}
    selectedSkirting={selectedSkirting}
    selectedFastener={selectedFastener}
    selectedConstruction={selectedConstruction}
    constructionType={constructionType}
    addItemsDetailed={addItemsDetailed as any}
    clientTitle={clientTitle}
    clientLastName={clientLastName}
    clientLocation={clientTown}
    clientEmail={clientEmail}
   demoType={
  demoOptions.find((d: any) => String(d.id) === String(selectedDemoId))?.name ??
  ""
}
    demoDescription={
  demoOptions.find((d: any) => String(d.id) === String(selectedDemoId))
    ?.proposal_description ?? ""
}
  />
)}

          {/* RIGHT: ESTIMATE SUMMARY */}
          {activeNav === "estimator" && (
            <aside className="estimate-summary">
              <div className="estimate-panel">
                {(() => {
                  const money0 = (n: number) =>
                    (n || 0).toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    });
                  const deckingRow = pricingItems.find(
                    (p) => String(p.id) === String(selectedDeckingId)
                  );

                  const railingRow = pricingItems.find(
                    (p) => String(p.id) === String(selectedRailingId)
                  );

                  const stairsRow = pricingItems.find(
                    (p) => String(p.id) === String(selectedStairsId)
                  );

                  const fastenerRow = pricingItems.find(
                    (p) => String(p.id) === String(selectedFastenerId)
                  );

                  const demoRow = pricingItems.find(
                    (p) => String(p.id) === String(selectedDemoId)
                  );

                  const skirtingRow = pricingItems.find(
                    (p) => String(p.id) === String(selectedSkirtingId)
                  );
                  const line = (label: string, amount: number) => {
                    const neg = amount < 0;
                    const abs = Math.abs(amount);

                    return (
                      <div className="estimate-panel__row" key={label}>
                        <span>{label}</span>
                        <span>
                          {neg ? `–$${money0(abs)}` : `$${money0(abs)}`}
                        </span>
                      </div>
                    );
                  };

                  return (
                    <>
                      <div className="estimate-panel__header">
                        <div className="estimate-panel__title">ESTIMATE</div>
                        <div className="estimate-panel__total">
                          ${money0(finalEstimate)}
                        </div>
                      </div>

                      <div
                        className="estimate-panel__disclosure"
                        role="button"
                        tabIndex={0}
                        onClick={() => setShowBreakdown((v) => !v)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setShowBreakdown((v) => !v);
                          }
                        }}
                        aria-expanded={showBreakdown}
                      >
                        <span className="estimate-panel__disclosure-label">
                          {showBreakdown ? "less" : "...more"}
                        </span>
                        <span
                          className={`estimate-panel__chev ${
                            showBreakdown ? "is-open" : ""
                          }`}
                          aria-hidden="true"
                        >
                          ▾
                        </span>
                      </div>

                      {showBreakdown && (
                        <div className="estimate-panel__rows">
                          {deckingSubtotal > 0 &&
                            line(
                              catItemLabel("Decking", deckingRow?.name || ""),
                              deckingSubtotal * upliftMultiplier
                            )}
                          {railingSubtotal > 0 &&
                            line(
                              catItemLabel("Railing", railingRow?.name || ""),
                              railingSubtotal * upliftMultiplier
                            )}
                          {stairsSubtotal > 0 &&
                            line(
                              catItemLabel("Stairs", stairsRow?.name || ""),
                              stairsSubtotal * upliftMultiplier
                            )}
                          {fastenerSubtotal > 0 &&
                            line(
                              catItemLabel(
                                "Fasteners",
                                fastenerRow?.name || ""
                              ),
                              fastenerSubtotal * upliftMultiplier
                            )}

                          {demoSubtotal > 0 &&
                            line(
                              catItemLabel("Demolition", demoRow?.name || ""),
                              demoSubtotal * upliftMultiplier
                            )}

                          {skirtingSubtotal > 0 &&
                            line(
                              catItemLabel(
                                skirtingCategory || "Skirting / Lattice",
                                skirtingRow?.name || ""
                              ),
                              skirtingSubtotal * upliftMultiplier
                            )}
                          {(addItemsDetailed as any[])
                            .filter(
                              (r) => r.picked && Number(r.lineBase || 0) !== 0
                            )

                            .map((r) =>
                              line(
                                catItemLabel(
                                  r.category || "Add Item",
                                  r.picked?.name || ""
                                ),
                                r.isFixedPrice
                                  ? r.lineBase
                                  : r.lineBase * upliftMultiplier
                              )
                            )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              {/* Decking Price Levels (Trex only) */}
{(() => {
 const isTrex =
  ((selectedDecking?.name || "") as string).toLowerCase().includes("trex");


  if (!isTrex) return null;

  return (
    <div className="estimate-panel" style={{ marginTop: 12 }}>
      <div
        className="estimate-panel__disclosure"
        role="button"
        tabIndex={0}
        onClick={() => setShowDeckingLevels((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setShowDeckingLevels((v) => !v);
          }
        }}
        aria-expanded={showDeckingLevels}
      >
        <span className="estimate-panel__disclosure-label">
          Decking Tier Pricing
        </span>
        <span
          className={`estimate-panel__chev ${showDeckingLevels ? "is-open" : ""}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </div>

     {showDeckingLevels && (
  <div className="estimate-panel__rows">
    {/* header row */}
    <div
      className="estimate-panel__row"
      style={{
        fontSize: 11,
        opacity: 0.7,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      <span>Level</span>
      <span style={{ display: "flex", gap: 14 }}>
        <span style={{ minWidth: 90, textAlign: "right" }}>Total</span>
        <span style={{ minWidth: 70, textAlign: "right" }}>Δ</span>
      </span>
    </div>

    {(trexLevelsWhatIf?.rows || []).map((r) => {
      const isCurrent =
        (selectedDecking?.name || "").toLowerCase().includes(r.level.toLowerCase());

      return (
        <div
          key={r.level}
          className="estimate-panel__row"
          style={{
            padding: "10px 0",
            borderTop: "1px solid rgba(0,0,0,0.06)",
            fontWeight: isCurrent ? 800 : 600,
            opacity: isCurrent ? 1 : 0.95,
          }}
        >
          <span>
            {r.level}
            {isCurrent ? (
              <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.65 }}>
                (current)
              </span>
            ) : null}
          </span>

          <span style={{ display: "flex", gap: 14 }}>
            <span style={{ minWidth: 90, textAlign: "right" }}>
              {r.labelTotal}
            </span>
            <span style={{ minWidth: 70, textAlign: "right", opacity: 0.85 }}>
              {r.labelDiff}
            </span>
          </span>
        </div>
      );
    })}

    {/* If rows didn't compute (missing data) */}
    {trexLevelsWhatIf && (trexLevelsWhatIf.rows || []).length === 0 && (
      <div className="estimate-panel__row">
        <span style={{ opacity: 0.7 }}>—</span>
        <span style={{ opacity: 0.7 }}>—</span>
      </div>
    )}
  </div>
)}

    </div>
  );
})()}

            </aside>
          )}
          
        </div>
      </main>

      <ConfirmNewProjectModal
        open={confirmNewOpen}
        onCancel={cancelNew}
        onDiscard={discardAndNew}
        onSave={saveAndNew}
      />

      {/* =============================== */}
      {/* EMAIL MODAL (TEMP TEST) */}
      {/* =============================== */}
      {emailModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setEmailModalOpen(false)}
        >
          <div
            style={{
              width: "min(720px, 95vw)",
              background: "#fff",
              borderRadius: 12,
              padding: 16,
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>
              Send Estimate
            </div>

            <div style={{ fontSize: 13, marginBottom: 8 }}>
              <div>
                <b>To:</b>{" "}
                {(emailDraft?.to || clientEmail || "").trim() || "(empty)"}
              </div>

              <div>
                <b>Subject:</b> {emailDraft?.subject || "(empty)"}
              </div>

              {/* ✅ STEP 2C: Show CC only when toggle is ON */}
              {emailDraft?.sendMeCopy &&
              (userSettings?.userEmail || "").trim() ? (
                <div>
                  <b>CC:</b> {(userSettings?.userEmail || "").trim()}
                </div>
              ) : null}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                margin: "10px 0 12px",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                Send me a copy
              </span>

              <label
                style={{
                  position: "relative",
                  display: "inline-block",
                  width: 34,
                  height: 18,
                }}
              >
                <input
                  type="checkbox"
                  checked={sendMeCopy}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSendMeCopy(checked);
                    setEmailDraft((d) =>
                      d ? { ...d, sendMeCopy: checked } : d
                    );
                  }}
                />

                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundColor: sendMeCopy ? "#16a34a" : "#d1d5db",
                    borderRadius: 999,
                    transition: "0.2s",
                  }}
                />

                {/* Knob */}
                <span
                  style={{
                    position: "absolute",
                    height: 14,
                    width: 14,
                    left: sendMeCopy ? 18 : 2,
                    top: 2,
                    backgroundColor: "#fff",
                    borderRadius: "50%",
                    transition: "0.2s",
                  }}
                />
              </label>
            </div>

            <textarea
              value={emailDraft?.body || ""}
              onChange={(e) =>
                setEmailDraft((d) => (d ? { ...d, body: e.target.value } : d))
              }
              style={{
                fontFamily:
                  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
                fontSize: "14px",
                lineHeight: "1.5",
                padding: "10px",
                resize: "none",
                height: "180px",
                width: "100%",
              }}
            />

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 12,
              }}
            >
              <button onClick={() => setEmailModalOpen(false)}>Cancel</button>

              <button
                onClick={handleSendEmailFromModal}
                style={{ fontWeight: 700 }}
                disabled={!emailDraft}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===============================
// CONFIRM MODAL
// ===============================
function ConfirmNewProjectModal({
  open,
  onCancel,
  onDiscard,
  onSave,
}: {
  open: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  if (!open) return null;

  return ReactDOM.createPortal(
    <div className="du-modal-overlay" role="dialog" aria-modal="true">
      <div className="du-modal-card">
        <div className="du-modal-title">Start a new estimate?</div>
        <div className="du-modal-subtitle">
          You have unsaved changes. Choose what to do before starting a new
          estimate.
        </div>

        <div className="du-modal-actions">
          <button
            type="button"
            className="du-btn du-btn-ghost"
            onClick={onCancel}
          >
            Cancel
          </button>

          <div className="du-modal-actions-right">
            <button
              type="button"
              className="du-btn du-btn-secondary"
              onClick={onDiscard}
            >
              Discard &amp; New
            </button>

            <button
              type="button"
              className="du-btn du-btn-primary"
              onClick={onSave}
            >
              Save &amp; New
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ===============================
// ANALYTICS DASHBOARD (your original)
// ===============================
type CategoryRow = { category: string; before: number; after: number };
type AnalyticsDashboardProps = {
  permitThreshold: number | null;
  baseTotal: number;
  finalTotal: number;
  upliftMultiplier: number;

  financePct: number;
  perceivedPct: number;
  miPct: number;
  permitPct: number;
  smallJobPct: number;

  financeDollars: number;
  perceivedDollars: number;
  miDollars: number;
  permitDollars: number;
  smallJobDollars: number;

  totalUpliftDollars: number;
  categoryRows: CategoryRow[];
};
function AnalyticsDashboard(props: AnalyticsDashboardProps) {
  return (
    <>
      {/*
{upliftCards.map((c) => (
  <div key={c.label} className="tesla-card">
    <div className="tesla-kicker">{c.label}</div>
    <div className="tesla-big">{money0(c.value)}</div>
  </div>
))}

<div className="tesla-card tesla-card--hero">
  <div className="tesla-kicker">Final Estimate</div>
  <div className="tesla-big">{money0(finalTotal)}</div>

  <div className="tesla-sub">
    Total Uplift{" "}
    <span className="tesla-mono">{money0(totalUpliftDollars)}</span>
  </div>

  <div className="tesla-sub" style={{ opacity: 0.7 }}>
    Category total check:{" "}
    <span className="tesla-mono">{money0(totalAfter)}</span>
  </div>
</div>
*/}
    </>
  );
}
export default App;
