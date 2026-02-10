// src/proposalSections.ts
import { supabase } from "./supabaseClient";

// Keep these types aligned with SettingsPage
export type ProposalSectionType = "bullets" | "paragraph" | "reviews";

export type ProposalSection = {
  id: string;
  title: string;
  enabled: boolean;
  type: ProposalSectionType;
  text?: string;
  reviews?: {
    subtitle?: string;
    rating?: string;
    count?: string;
    location?: string;
    company?: string;
  };
};

export type ProposalSectionRow = {
  id: string;
  org_id: string;
  sort_order: number;
  title: string;
  enabled: boolean;
  type: ProposalSectionType;
  text: string | null;
  reviews: any | null;
  created_at?: string;
  updated_at?: string;
};

const cacheKey = (orgId: string) => `du_cache:org_proposal_sections::${orgId}`;
const cacheTsKey = (orgId: string) => `du_cache:org_proposal_sections_ts::${orgId}`;

// ----------
// Mappers
// ----------
function rowToSection(r: ProposalSectionRow): ProposalSection {
  return {
    id: r.id,
    title: r.title,
    enabled: !!r.enabled,
    type: r.type,
    text: r.text ?? undefined,
    reviews: (r.reviews ?? undefined) as any,
  };
}

function sectionToUpsertRow(orgId: string, section: ProposalSection, sortOrder: number) {
  return {
    id: section.id, // can be client-generated or existing uuid
    org_id: orgId,
    sort_order: sortOrder,
    title: (section.title || "").trim(),
    enabled: !!section.enabled,
    type: section.type,
    text: section.text ?? null,
    reviews: section.type === "reviews" ? (section.reviews ?? null) : null,
  };
}

// ----------
// Read (network first, cache fallback)
// ----------
export async function fetchProposalSections(orgId: string): Promise<ProposalSection[]> {
  if (!orgId) return [];

  // 1) Try Supabase first
  try {
    const { data, error } = await supabase
      .from("org_proposal_sections")
      .select("id, org_id, sort_order, title, enabled, type, text, reviews")
      .eq("org_id", orgId)
      .order("sort_order", { ascending: true });

    if (error) throw error;

    const rows = (data || []) as ProposalSectionRow[];
    const sections = rows.map(rowToSection);

    // cache successful result
    try {
      localStorage.setItem(cacheKey(orgId), JSON.stringify(sections));
      localStorage.setItem(cacheTsKey(orgId), String(Date.now()));
    } catch {}

    return sections;
  } catch (err) {
    // 2) Cache fallback
    try {
      const raw = localStorage.getItem(cacheKey(orgId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as ProposalSection[];
      }
    } catch {}

    // 3) Nothing available
    throw err;
  }
}

// optional helper (useful later for UI messaging)
export function getProposalSectionsCacheTimestamp(orgId: string): number | null {
  try {
    const v = localStorage.getItem(cacheTsKey(orgId));
    const n = Number(v || "");
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

// ----------
// Write (admins only; enforced by RLS)
// ----------
export async function upsertProposalSections(
  orgId: string,
  sections: ProposalSection[]
): Promise<void> {
  if (!orgId) throw new Error("Missing orgId");

  const payload = (sections || []).map((s, i) => sectionToUpsertRow(orgId, s, i));

  const { error } = await supabase.from("org_proposal_sections").upsert(payload, {
    onConflict: "id",
  });

  if (error) throw error;

  // refresh cache with latest data (keeps offline accurate)
  try {
    localStorage.setItem(cacheKey(orgId), JSON.stringify(sections));
    localStorage.setItem(cacheTsKey(orgId), String(Date.now()));
  } catch {}
}

export async function deleteProposalSection(orgId: string, id: string): Promise<void> {
  if (!orgId) throw new Error("Missing orgId");
  if (!id) throw new Error("Missing id");

  const { error } = await supabase
    .from("org_proposal_sections")
    .delete()
    .eq("org_id", orgId)
    .eq("id", id);

  if (error) throw error;
}
