// src/settings.ts
//
// User & org settings persistence.
//
// Two tables in Supabase:
//   - org_settings  (per-org: logo, company info, templates, layout order)
//   - user_settings (per-user: name, phone, email)
//
// Strategy: network first, localStorage as cache. On first load after deploy,
// if Supabase rows are empty and localStorage has data, push localStorage up
// (auto-migration). Mirrors the pattern in proposalSections.ts.

import { supabase } from "./supabaseClient";

// UI-facing shape — what App.tsx and SettingsPage already work with.
export type AppUserSettings = {
  // Per-user (user_settings)
  userName: string;
  userPhone: string;
  userEmail: string;

  // Per-org (org_settings)
  logoDataUrl: string;
  logoSlogan: string;
  companyName: string;
  companyPhone: string;
  companyAddress: string;
  companyWebsite: string;
  companySlogan: string;
  license: string;
  emailSubjectTemplate: string;
  emailBodyTemplate: string;
  proposalLayoutOrder: string[];

  // Anything else SettingsPage stuffs in (e.g. proposalSections during edit)
  // We pass it through but don't persist it across the org/user split.
  [key: string]: any;
};

const CACHE_KEY = "du_user_settings"; // existing key, kept as the cache

export const DEFAULT_SETTINGS: AppUserSettings = {
  userName: "Jason Colapinto",
  userPhone: "",
  userEmail: "",

  logoDataUrl: "",
  logoSlogan: "",
  companyName: "Decks Unique",
  companyPhone: "",
  companyAddress: "",
  companyWebsite: "",
  companySlogan: "",
  license: "",
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
  proposalLayoutOrder: [],
};

// ----------------------------------------------------------------------------
// Cache helpers
// ----------------------------------------------------------------------------
export function readCachedSettings(): AppUserSettings | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return null;
  }
}

export function writeCachedSettings(settings: AppUserSettings) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(settings));
  } catch {}
}

// ----------------------------------------------------------------------------
// Detect whether a cache snapshot has any user-entered data worth migrating.
// (Distinguishes a real saved snapshot from the empty defaults.)
// ----------------------------------------------------------------------------
function hasMeaningfulData(s: AppUserSettings | null): boolean {
  if (!s) return false;
  const fields = [
    s.userPhone,
    s.userEmail,
    s.logoDataUrl,
    s.companyPhone,
    s.companyAddress,
    s.companyWebsite,
    s.companySlogan,
    s.license,
    s.logoSlogan,
  ];
  if (fields.some((v) => typeof v === "string" && v.trim().length > 0)) return true;
  if (Array.isArray(s.proposalLayoutOrder) && s.proposalLayoutOrder.length > 0)
    return true;
  // userName/companyName/templates have defaults — only count if user changed them
  if (s.userName && s.userName !== DEFAULT_SETTINGS.userName) return true;
  if (s.companyName && s.companyName !== DEFAULT_SETTINGS.companyName) return true;
  if (
    s.emailSubjectTemplate &&
    s.emailSubjectTemplate !== DEFAULT_SETTINGS.emailSubjectTemplate
  )
    return true;
  if (
    s.emailBodyTemplate &&
    s.emailBodyTemplate !== DEFAULT_SETTINGS.emailBodyTemplate
  )
    return true;
  return false;
}

// ----------------------------------------------------------------------------
// Fetch: Supabase first, merge org + user; auto-migrate cache when both empty.
// ----------------------------------------------------------------------------
export async function fetchSettings(
  orgId: string,
  userId: string
): Promise<AppUserSettings> {
  if (!orgId || !userId) {
    return readCachedSettings() ?? { ...DEFAULT_SETTINGS };
  }

  const [orgRes, userRes] = await Promise.all([
    supabase
      .from("org_settings")
      .select(
        "logo_data_url, logo_slogan, company_name, company_phone, company_address, company_website, company_slogan, license, email_subject_template, email_body_template, proposal_layout_order"
      )
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase
      .from("user_settings")
      .select("user_name, user_phone, user_email")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  // PGRST116 = "no rows" (maybeSingle returns null in newer clients, but be safe)
  if (orgRes.error && (orgRes.error as any).code !== "PGRST116") {
    // Surface real errors, but fall through to cache so the app stays usable offline
    console.warn("org_settings fetch error:", orgRes.error);
  }
  if (userRes.error && (userRes.error as any).code !== "PGRST116") {
    console.warn("user_settings fetch error:", userRes.error);
  }

  const orgRow = orgRes.data as any;
  const userRow = userRes.data as any;

  // Auto-migrate: nothing in Supabase, but cache has meaningful data → push it up.
  if (!orgRow && !userRow) {
    const cached = readCachedSettings();
    if (hasMeaningfulData(cached)) {
      try {
        await upsertSettings(orgId, userId, cached as AppUserSettings);
        return cached as AppUserSettings;
      } catch (err) {
        console.warn("Settings auto-migration failed; using cache:", err);
        return cached as AppUserSettings;
      }
    }
  }

  // Merge org + user + defaults
  const merged: AppUserSettings = {
    ...DEFAULT_SETTINGS,
    // org-level
    logoDataUrl: orgRow?.logo_data_url ?? "",
    logoSlogan: orgRow?.logo_slogan ?? "",
    companyName: orgRow?.company_name ?? DEFAULT_SETTINGS.companyName,
    companyPhone: orgRow?.company_phone ?? "",
    companyAddress: orgRow?.company_address ?? "",
    companyWebsite: orgRow?.company_website ?? "",
    companySlogan: orgRow?.company_slogan ?? "",
    license: orgRow?.license ?? "",
    emailSubjectTemplate:
      orgRow?.email_subject_template ?? DEFAULT_SETTINGS.emailSubjectTemplate,
    emailBodyTemplate:
      orgRow?.email_body_template ?? DEFAULT_SETTINGS.emailBodyTemplate,
    proposalLayoutOrder: Array.isArray(orgRow?.proposal_layout_order)
      ? orgRow.proposal_layout_order
      : [],
    // user-level
    userName: userRow?.user_name ?? DEFAULT_SETTINGS.userName,
    userPhone: userRow?.user_phone ?? "",
    userEmail: userRow?.user_email ?? "",
  };

  writeCachedSettings(merged);
  return merged;
}

// ----------------------------------------------------------------------------
// Upsert: split UI shape into org + user payloads, upsert both.
// ----------------------------------------------------------------------------
export async function upsertSettings(
  orgId: string,
  userId: string,
  settings: AppUserSettings
): Promise<void> {
  if (!orgId || !userId) throw new Error("Missing orgId or userId");

  const now = new Date().toISOString();

  const orgPayload = {
    org_id: orgId,
    logo_data_url: settings.logoDataUrl || null,
    logo_slogan: settings.logoSlogan || null,
    company_name: settings.companyName || null,
    company_phone: settings.companyPhone || null,
    company_address: settings.companyAddress || null,
    company_website: settings.companyWebsite || null,
    company_slogan: settings.companySlogan || null,
    license: settings.license || null,
    email_subject_template: settings.emailSubjectTemplate || null,
    email_body_template: settings.emailBodyTemplate || null,
    proposal_layout_order: Array.isArray(settings.proposalLayoutOrder)
      ? settings.proposalLayoutOrder
      : [],
    updated_at: now,
    updated_by: userId,
  };

  const userPayload = {
    user_id: userId,
    org_id: orgId,
    user_name: settings.userName || null,
    user_phone: settings.userPhone || null,
    user_email: settings.userEmail || null,
    updated_at: now,
  };

  const [orgRes, userRes] = await Promise.all([
    supabase.from("org_settings").upsert(orgPayload, { onConflict: "org_id" }),
    supabase
      .from("user_settings")
      .upsert(userPayload, { onConflict: "user_id" }),
  ]);

  if (orgRes.error) throw orgRes.error;
  if (userRes.error) throw userRes.error;

  writeCachedSettings(settings);
}
