// src/sowTemplates.ts
import { supabase } from "./supabaseClient";
const SOW_CACHE_KEY = "du_cache::sow_templates_rows";
const SOW_CACHE_TS_KEY = "du_cache::sow_templates_ts";

/* ======================================
   TYPES
====================================== */
export type SowTemplateFullRow = {
  construction_key: string;
  label: string;
  body: string;
};

/* ======================================
   READ
====================================== */
export async function fetchSowTemplatesRows(): Promise<SowTemplateFullRow[]> {
  try {
    // 1) Try network (Supabase)
    const { data, error } = await supabase
      .from("sow_templates")
      .select("construction_key,label,body")
      .order("label", { ascending: true });

    if (error) throw error;

    const rows = (data || []) as SowTemplateFullRow[];

    // 2) Cache on success
    try {
      localStorage.setItem(SOW_CACHE_KEY, JSON.stringify(rows));
      localStorage.setItem(SOW_CACHE_TS_KEY, String(Date.now()));
    } catch {
      // ignore storage errors
    }

    return rows;
  } catch (err) {
    // 3) Fallback to cache when offline / Supabase fails
    try {
      const raw = localStorage.getItem(SOW_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as SowTemplateFullRow[];
        if (Array.isArray(cached)) return cached;
      }
    } catch {
      // ignore cache parse errors
    }

    // 4) If no cache, re-throw original error
    throw err;
  }
}

/* ======================================
   UPSERT (INSERT or UPDATE)
====================================== */
export async function upsertSowTemplate(row: SowTemplateFullRow) {
  const { error } = await supabase
    .from("sow_templates")
    .upsert(row, { onConflict: "construction_key" });

  if (error) throw error;
}

/* ======================================
   DELETE
====================================== */
export async function deleteSowTemplate(construction_key: string) {
  const { error } = await supabase
    .from("sow_templates")
    .delete()
    .eq("construction_key", construction_key);

  if (error) throw error;
}
