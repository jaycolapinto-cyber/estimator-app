// SettingsPage.tsx
// ✅ Prepared By fields
// ✅ Logo upload (stored in localStorage via App's userSettings persistence)
// ✅ Proposal Sections builder (add / rename / reorder / enable / remove)
// ✅ Scope of Work text by Construction Type (optional)
// ✅ Organization name (orgs.name) — admin can edit, users read-only

import React, { useEffect, useMemo, useState } from "react";
import "./SettingsPage.css";
import { supabase } from "./supabaseClient";
import {
  fetchSowTemplatesRows,
  upsertSowTemplate,
  deleteSowTemplate,
  SowTemplateFullRow,
} from "./sowTemplates";
import {
  fetchProposalSections,
  upsertProposalSections,
  deleteProposalSection,
} from "./proposalSections";

// ------------------------------
// TYPES exported for ProposalPage
// ------------------------------
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

// Keep this flexible
export type ConstructionTypeId = string;

export type UserSettings = {
  userName?: string | null;
  userPhone?: string | null;
  userEmail?: string | null;

  // Email Proposal templates
  emailSubjectTemplate?: string | null;
  emailBodyTemplate?: string | null;

  companyName?: string | null;
  companyPhone?: string | null;
  companyAddress?: string | null;
  companyWebsite?: string | null;
  companySlogan?: string | null;
  license?: string | null;

  logoDataUrl?: string | null;

  proposalFooterText?: string | null;

  printFooterLeft?: string;
  printFooterCenter?: string;

  proposalSections?: ProposalSection[];
  scopeOfWorkByConstructionType?: Record<string, string>;
  logoSlogan?: string | null;
proposalLayoutOrder?: string[]; 

};


type SettingsPageProps = {
  userSettings: UserSettings;
  setUserSettings: React.Dispatch<React.SetStateAction<UserSettings>>;

  // ✅ NEW (safe + optional): pass from App.tsx later
  orgId?: string | null;
  isAdmin?: boolean;
};

// ------------------------------
// Helpers
// ------------------------------

const uid = () => {
  const c: any = typeof crypto !== "undefined" ? crypto : null;
  return typeof c?.randomUUID === "function"
    ? c.randomUUID()
    : `${Date.now()}-${Math.random()}`;
};

const DEFAULT_SECTIONS: Omit<ProposalSection, "id">[] = [
  {
    title: "5-Year Workmanship Warranty",
    enabled: true,
    type: "paragraph",
    text: "All labor is warranted for five (5) years from project completion. Manufacturer warranties apply separately to materials and products and are subject to their individual terms and conditions.",
  },
  {
    title: "Effective Period",
    enabled: true,
    type: "paragraph",
    text: "This proposal is valid for one hundred twenty (120) days from the date issued. Pricing and material availability are subject to change after this period.",
  },
  {
    title: "3D Renderings and Sketch Plans",
    enabled: true,
    type: "paragraph",
    text: "3D renderings and sketch plans will be issued upon receipt of deposit.",
  },
];

const DEFAULT_LAYOUT_TITLES = [
  "PROVEN REPUTATION & TRUSTED SERVICE",
  "THE ONLY DECK BUILDER ON LONG ISLAND USING PREMIUM",
  "LONG ISLAND’S ONLY “BRICK AND MORTAR” DECK SPECIALIST",
  "LONG ISLAND’S ONLY “BRICK AND MORTAR” DECK SPECIALIST",
  "EFFECTIVE PERIOD",
  "LIFETIME WORKMANSHIP WARRANT",
];

function buildDefaultLayoutOrder(sections: ProposalSection[]) {
  const remaining = [...sections];
  const ordered: string[] = [];

  for (const title of DEFAULT_LAYOUT_TITLES) {
    const idx = remaining.findIndex((s) => s.title.trim().toUpperCase() === title.toUpperCase());
    if (idx >= 0) {
      const [match] = remaining.splice(idx, 1);
      ordered.push(match.id);
    }
  }

  // append any leftover custom sections
  ordered.push(...remaining.map((s) => s.id));

  return [...ordered, "__details__", "__timeline__"];
}

function ensureDefaults(prev: UserSettings): UserSettings {
  const next: UserSettings = { ...(prev || {}) };

  if (!Array.isArray(next.proposalSections) || next.proposalSections.length === 0) {
    next.proposalSections = DEFAULT_SECTIONS.map((s) => ({ ...s, id: uid() }));
  }

  if (!next.scopeOfWorkByConstructionType) {
    next.scopeOfWorkByConstructionType = {};
  }
  if (!next.emailSubjectTemplate) {
    next.emailSubjectTemplate = "Your Decks Unique Proposal – {{clientLastName}}";
  }
  // ✅ default layout order (preferred titles)
  if (!Array.isArray(next.proposalLayoutOrder) || next.proposalLayoutOrder.length === 0) {
    next.proposalLayoutOrder = buildDefaultLayoutOrder(next.proposalSections || []);
  }


  if (!next.emailBodyTemplate) {
    next.emailBodyTemplate =
      "Hi {{clientTitle}} {{clientLastName}},\n\n" +
      "Thank you for the opportunity to quote your project.\n" +
      "Attached is your proposal for review.\n\n" +
      "If you have any questions, reply here or call/text me at {{userPhone}}.\n\n" +
      "Thanks,\n" +
      "{{userName}}\n" +
      "{{companyName}}";
  }

  return next;
}

export default function SettingsPage({
  userSettings,
  setUserSettings,
  orgId = null,
  isAdmin = true, // ✅ TEMP default so this won't break until you wire real admin logic from App.tsx
}: SettingsPageProps) {
  // =========================================================
  // ORGANIZATION NAME (orgs table)
  // =========================================================
  const [orgName, setOrgName] = useState<string>("");
  const [orgNameDraft, setOrgNameDraft] = useState<string>("");
  const [orgNameLoading, setOrgNameLoading] = useState(false);
  const [orgNameSaving, setOrgNameSaving] = useState(false);
  const [orgNameError, setOrgNameError] = useState<string | null>(null);
  const [orgNameSavedMsg, setOrgNameSavedMsg] = useState<string | null>(null);
const defaultsAppliedRef = React.useRef(false);

  async function loadOrgName() {
    if (!orgId) {
      setOrgName("");
      setOrgNameDraft("");
      return;
    }
    setOrgNameLoading(true);
    setOrgNameError(null);
    try {
      const { data, error } = await supabase
        .from("orgs")
        .select("name")
        .eq("id", orgId)
        .single();

      if (error) throw error;

      const name = (data?.name || "").toString();
      setOrgName(name);
      setOrgNameDraft(name);
    } catch (e: any) {
      setOrgNameError(String(e?.message || e || "Failed to load organization name."));
      setOrgName("");
      setOrgNameDraft("");
    } finally {
      setOrgNameLoading(false);
    }
  }
useEffect(() => {
  console.log("✅ SettingsPage MOUNT");
  return () => console.log("❌ SettingsPage UNMOUNT");
}, []);

  async function saveOrgName() {
    if (!orgId) return;
    setOrgNameSaving(true);
    setOrgNameError(null);
    setOrgNameSavedMsg(null);

    try {
      const next = (orgNameDraft || "").trim();
      if (!next) throw new Error("Organization name cannot be blank.");

      const { error } = await supabase
        .from("orgs")
        .update({ name: next })
        .eq("id", orgId);

      if (error) throw error;

      setOrgName(next);
      setOrgNameDraft(next);
      setOrgNameSavedMsg("Saved.");
      window.setTimeout(() => setOrgNameSavedMsg(null), 2500);
    } catch (e: any) {
      setOrgNameError(String(e?.message || e || "Failed to save organization name."));
    } finally {
      setOrgNameSaving(false);
    }
  }

  useEffect(() => {
    loadOrgName();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // =========================================================
  // SOW TEMPLATES (shared in Supabase)
  // =========================================================
  const [sowRows, setSowRows] = useState<SowTemplateFullRow[]>([]);
  const [sowLoading, setSowLoading] = useState(false);
  const [sowError, setSowError] = useState<string | null>(null);

  const [selectedSowKey, setSelectedSowKey] = useState<string>("");
  const selectedSowRow = useMemo(
    () => sowRows.find((r) => r.construction_key === selectedSowKey) || null,
    [sowRows, selectedSowKey]
  );

  const [editLabel, setEditLabel] = useState("");
  const [editBody, setEditBody] = useState("");

  async function loadSowTemplates() {
    setSowLoading(true);
    setSowError(null);
    try {
      const rows = await fetchSowTemplatesRows();
      setSowRows(rows);

      // pick first row if nothing selected
      if (!selectedSowKey && rows.length) {
        setSelectedSowKey(rows[0].construction_key);
      }
      // if selected key no longer exists, fallback to first
      if (selectedSowKey && !rows.some((r) => r.construction_key === selectedSowKey)) {
        setSelectedSowKey(rows[0]?.construction_key || "");
      }
    } catch (e: any) {
      setSowError(String(e?.message || e || "Failed to load SOW templates"));
    } finally {
      setSowLoading(false);
    }
  }

  useEffect(() => {
    loadSowTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // when user picks a different template, load it into editor fields
  useEffect(() => {
    if (!selectedSowRow) {
      setEditLabel("");
      setEditBody("");
      return;
    }
    setEditLabel(selectedSowRow.label || "");
    setEditBody(selectedSowRow.body || "");
  }, [selectedSowRow]);

  function normalizeKey(input: string) {
    return (input || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "_")
      .replace(/-+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
  }

  async function onAddSowTemplate() {
    if (!isAdmin) return;

    const raw = window.prompt(
      "Enter a new Construction Key (example: new_construction, resurface, second_story)"
    );
    const key = normalizeKey(raw || "");
    if (!key) return;

    const label = window.prompt("Enter a label (example: New Construction)") || key;

    try {
      await upsertSowTemplate({ construction_key: key, label, body: "" });
      await loadSowTemplates();
      setSelectedSowKey(key);
    } catch (e: any) {
      window.alert(String(e?.message || e || "Failed to add template"));
    }
  }

  async function onSaveSowTemplate() {
    if (!isAdmin || !selectedSowKey) return;

    try {
      await upsertSowTemplate({
        construction_key: selectedSowKey,
        label: editLabel || selectedSowKey,
        body: editBody || "",
      });
      await loadSowTemplates();
      window.alert("Saved.");
    } catch (e: any) {
      window.alert(String(e?.message || e || "Failed to save template"));
    }
  }

  async function onDeleteSowTemplate() {
    if (!isAdmin || !selectedSowKey) return;

    const ok = window.confirm(`Delete template "${selectedSowKey}"? This cannot be undone.`);
    if (!ok) return;

    try {
      await deleteSowTemplate(selectedSowKey);
      setSelectedSowKey("");
      await loadSowTemplates();
      window.alert("Deleted.");
    } catch (e: any) {
      window.alert(String(e?.message || e || "Failed to delete template"));
    }
  }

 useEffect(() => {
  if (defaultsAppliedRef.current) return;
  defaultsAppliedRef.current = true;

  setUserSettings((prev) => ensureDefaults(prev || {}));
}, [setUserSettings]);



const settings = userSettings || {};
  // =========================================================
  // PROPOSAL SECTIONS (shared in Supabase by org)
  // =========================================================
  const [dbSections, setDbSections] = useState<ProposalSection[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [sectionsError, setSectionsError] = useState<string | null>(null);
  const [sectionsDirty, setSectionsDirty] = useState(false);
  const [sectionsSaving, setSectionsSaving] = useState(false);
  const [sectionsSavedMsg, setSectionsSavedMsg] = useState<string | null>(null);
async function saveProposalSections() {
  if (!isAdmin) return;
  if (!orgId) {
    window.alert("Missing orgId (cannot save proposal sections yet).");
    return;
  }

  setSectionsSaving(true);
  setSectionsError(null);
  setSectionsSavedMsg(null);

  try {
    // Save in current UI order
   await upsertProposalSections(orgId, orderedSections);

// 🔥 Persist layout order as well
update({ proposalLayoutOrder: mergedOrder });

setSectionsDirty(false);
setSectionsSavedMsg("Saved.");
    window.setTimeout(() => setSectionsSavedMsg(null), 2500);

    // Reload from DB so ids/order are confirmed
    await loadProposalSections();
  } catch (e: any) {
    setSectionsError(String(e?.message || e || "Failed to save proposal sections."));
  } finally {
    setSectionsSaving(false);
  }
}

  async function loadProposalSections() {
    if (!orgId) {
      setDbSections([]);
      return;
    }

    setSectionsLoading(true);
    setSectionsError(null);

    try {
      const rows = await fetchProposalSections(orgId);

      // If org has nothing yet, show defaults locally (we won't auto-seed silently)
      if (!rows || rows.length === 0) {
        const defaults = DEFAULT_SECTIONS.map((s) => ({ ...s, id: uid() }));
        setDbSections(defaults);
        setSectionsDirty(true);
        setSectionsError("No org proposal sections found yet. Admin: click Save to seed defaults.");
      } else {
        setDbSections(rows);
        setSectionsDirty(false);
      }
    } catch (e: any) {
      setSectionsError(String(e?.message || e || "Failed to load proposal sections."));
    } finally {
      setSectionsLoading(false);
    }
  }

  useEffect(() => {
    loadProposalSections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const update = (patch: Partial<UserSettings>) => {
    setUserSettings((prev) => ({ ...(prev || {}), ...patch }));
  };
    // ---------------------------------------------------------
  // ✅ Local drafts to prevent focus loss on parent updates
  // (Scope Templates already do this; these fields were not)
  // ---------------------------------------------------------
  const [draft, setDraft] = useState(() => ({
    userName: String(userSettings?.userName ?? ""),
    userPhone: String(userSettings?.userPhone ?? ""),
    userEmail: String(userSettings?.userEmail ?? ""),
    emailSubjectTemplate: String(userSettings?.emailSubjectTemplate ?? ""),
    emailBodyTemplate: String(userSettings?.emailBodyTemplate ?? ""),
    logoSlogan: String(userSettings?.logoSlogan ?? ""),
  }));

  // Keep drafts in sync if settings change from elsewhere (load, org switch, etc.)
  useEffect(() => {
    setDraft({
      userName: String(userSettings?.userName ?? ""),
      userPhone: String(userSettings?.userPhone ?? ""),
      userEmail: String(userSettings?.userEmail ?? ""),
      emailSubjectTemplate: String(userSettings?.emailSubjectTemplate ?? ""),
      emailBodyTemplate: String(userSettings?.emailBodyTemplate ?? ""),
      logoSlogan: String(userSettings?.logoSlogan ?? ""),
    });
  }, [
    userSettings?.userName,
    userSettings?.userPhone,
    userSettings?.userEmail,
    userSettings?.emailSubjectTemplate,
    userSettings?.emailBodyTemplate,
    userSettings?.logoSlogan,
  ]);

  const commitDraft = (patch: Partial<typeof draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    // commit to shared settings (persists via App.tsx localStorage effect)
    update(patch as any);
  };

  // Use Supabase sections wh`en available; fallback to local settings (back-compat)
  const sections = dbSections.length ? dbSections : settings.proposalSections || [];
 

// ✅ Step 3A: proposal layout order (lets Details/Timeline be reorderable with sections)
// NOTE: SOW is always top and Notes always bottom — those are NOT part of this list.
const layoutOrder = settings.proposalLayoutOrder || [];
const SYSTEM_ITEMS = ["__details__", "__timeline__"] as const;

const sectionMap = new Map<string, ProposalSection>(sections.map((s) => [s.id, s]));

const mergedOrder: string[] = (() => {
  // keep only ids that still exist
  const valid = layoutOrder.filter(
    (id) => SYSTEM_ITEMS.includes(id as any) || sectionMap.has(id)
  );

  // auto-add anything missing
  const missingSystem = SYSTEM_ITEMS.filter((id) => !valid.includes(id));
  const missingCustom = sections.map((s) => s.id).filter((id) => !valid.includes(id));

  return [...valid, ...missingSystem, ...missingCustom];})();


// ✅ custom sections in the exact order they should print/save (excludes system items)
const orderedSections: ProposalSection[] = mergedOrder
  .filter((id) => id !== "__details__" && id !== "__timeline__")
  .map((id) => sectionMap.get(id))
  .filter(Boolean) as ProposalSection[];

// ✅ Move ANY item in the proposal order (system + custom)
const moveLayoutItem = (id: string, dir: -1 | 1) => {
  if (!isAdmin) return;

  const idx = mergedOrder.indexOf(id);
  if (idx < 0) return;

  const nextIdx = idx + dir;
  if (nextIdx < 0 || nextIdx >= mergedOrder.length) return;

  const nextOrder = [...mergedOrder];
  [nextOrder[idx], nextOrder[nextIdx]] = [nextOrder[nextIdx], nextOrder[idx]];

  // persist order (SOW/Notes are NOT in this list)
  update({
  proposalLayoutOrder: nextOrder.map((x) => String(x).trim()).filter(Boolean),
});


  // also reorder DB sections array to match the new custom order
  const nextCustom = nextOrder
    .filter((x) => x !== "__details__" && x !== "__timeline__")
    .map((x) => sectionMap.get(x))
    .filter(Boolean) as ProposalSection[];

  setDbSections(nextCustom);
  setSectionsDirty(true);
  setSectionsSavedMsg(null);
};

 const setSections = (next: ProposalSection[]) => {
  console.log("setSections called ✅", {
    len: next?.length,
    first: next?.[0]?.title,
  });

  setDbSections(next);
  setSectionsDirty(true);
  setSectionsSavedMsg(null);
};



   const updateSection = (id: string, patch: Partial<ProposalSection>) => {
    if (!isAdmin) return;
    setSections(sections.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };


   const addSection = () => {
    if (!isAdmin) return;

    const next: ProposalSection = {
      id: uid(),
      title: "New Section",
      enabled: true,
      type: "bullets",
      text: "• Item one\n• Item two",
    };

    setSections([...sections, next]);
  };


 const removeSection = async (id: string) => {
  if (!isAdmin) return;

  // If it's already saved in Supabase, delete the row
  try {
    if (
      orgId &&
      id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id
      )
    ) {
      await deleteProposalSection(orgId, id);
    }
  } catch (e: any) {
    window.alert(String(e?.message || e || "Failed to delete section"));
    return;
  }

  setSections(sections.filter((s) => s.id !== id));
};


 
  const onLogoPick = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update({ logoDataUrl: String(reader.result || "") });
    reader.readAsDataURL(file);
  };

  return (
    <div className="settings-shell">
      <div className="settings-top">
        <div className="settings-kicker">SYSTEM</div>
  
        <div className="settings-sub">Proposal branding + section builder + scope templates.</div>
      </div>

      <div className="settings-content">
        {/* ✅ NEW: Organization */}
        <SectionCard
          title="Organization"
          subtitle="Your company name shown across the app. Admins can edit."
          right={
            isAdmin ? (
              <button
                type="button"
                className="ui-btn"
                onClick={saveOrgName}
                disabled={orgNameSaving || orgNameLoading || !orgId}
                title={!orgId ? "No orgId provided to SettingsPage yet." : "Save organization name"}
              >
                {orgNameSaving ? "Saving..." : "Save"}
              </button>
            ) : null
          }
        >
          {!orgId ? (
            <div className="micro">
              OrgId not provided to SettingsPage yet. (We will wire it from App.tsx next.)
            </div>
          ) : orgNameLoading ? (
            <div className="micro">Loading organization...</div>
          ) : (
            <>
              <Field label="Organization Name" spanAll>
                <input
                  className="ui-input"
                  value={isAdmin ? orgNameDraft : orgName}
                  onChange={(e) => setOrgNameDraft(e.target.value)}
                  disabled={!isAdmin || orgNameSaving}
                  placeholder="Decks Unique"
                />
              </Field>

              {orgNameError ? (
                <div className="micro" style={{ color: "#b00020", fontWeight: 700, marginTop: 8 }}>
                  {orgNameError}
                </div>
              ) : orgNameSavedMsg ? (
                <div className="micro" style={{ color: "#0b6b2f", fontWeight: 800, marginTop: 8 }}>
                  {orgNameSavedMsg}
                </div>
              ) : null}

              {!isAdmin ? (
                <div className="micro" style={{ marginTop: 8 }}>
                  You have read-only access. Ask an admin to edit the organization name.
                </div>
              ) : null}
            </>
          )}
        </SectionCard>


        {/* Prepared By */}
        <SectionCard title="Prepared By" subtitle="These fields appear on your proposal header.">
          <div className="grid-3">
            <Field label="Name">
              <input
                className="ui-input"
                value={settings.userName || ""}
                onChange={(e) => update({ userName: e.target.value })}
                placeholder="Jason Colapinto"
              />
            </Field>

            <Field label="Phone">
              <input
                className="ui-input"
                value={settings.userPhone || ""}
                onChange={(e) => update({ userPhone: e.target.value })}
                placeholder="(631) 555-1234"
              />
            </Field>

            <Field label="Email">
              <input
                className="ui-input"
                value={settings.userEmail || ""}
                onChange={(e) => update({ userEmail: e.target.value })}
                placeholder="you@company.com"
              />
            </Field>
          </div>
        </SectionCard>

        {/* Email Proposal Templates */}
        <SectionCard
          title="Email Proposal"
          subtitle="These templates are used when you click File → Email Proposal. Use placeholders like {{clientLastName}}."
        >
          <div className="grid-3">
            <Field label="Subject" spanAll>
              <input
                className="ui-input"
                value={settings.emailSubjectTemplate || ""}
                onChange={(e) => update({ emailSubjectTemplate: e.target.value })}
                placeholder="Your Decks Unique Proposal – {{clientLastName}}"
              />
            </Field>

            <Field label="Email Body" spanAll>
              <textarea
                className="ui-textarea"
                value={settings.emailBodyTemplate || ""}
                onChange={(e) => update({ emailBodyTemplate: e.target.value })}
                rows={9}
                placeholder={
                  "Hi {{clientTitle}} {{clientLastName}},\n\n" +
                  "Thank you...\n\n" +
                  "Thanks,\n{{userName}}"
                }
              />
            </Field>
          </div>

          <div className="micro" style={{ marginTop: 8 }}>
            Available placeholders: {"{{clientTitle}}"} {"{{clientFirstName}}"} {"{{clientLastName}}"}{" "}
            {"{{clientEmail}}"} {"{{userName}}"} {"{{userPhone}}"} {"{{companyName}}"}
          </div>
        </SectionCard>

        {/* Logo */}
        <SectionCard
          title="Logo"
          subtitle="Upload a PNG with transparency for the cleanest look."
          
          right={
            settings.logoDataUrl ? (
              <button
                type="button"
                className="ui-btn danger"
                onClick={() => update({ logoDataUrl: "" })}
              >
                Remove
              </button>
            ) : null
          }
        >
          <div className="logo-row">
            <div className="logo-preview">
              {settings.logoDataUrl ? (
                <img src={settings.logoDataUrl} alt="Logo" className="logo-img" />
              ) : (
                <div className="logo-empty">No logo</div>
              )}
            </div>
<Field label="Logo Slogan" spanAll>
  <input
    className="ui-input"
    value={settings.logoSlogan || ""}
    onChange={(e) => update({ logoSlogan: e.target.value })}
    placeholder="Example: Craftsmanship you can trust."
  />
</Field>

<div className="micro" style={{ marginTop: 8 }}>
  Tip: keep this short (1 line looks best).
</div>

            <div className="logo-actions">
              <label className="file-btn">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onLogoPick(e.target.files?.[0] || null)}
                />
                Upload Logo
              </label>
              <div className="micro">Tip: keep it wide, not tall. Transparent background looks best.</div>
            </div>
            <div style={{ marginTop: 14 }}>
  <Field label="Logo Slogan (prints under logo)" spanAll>
    <input
      className="ui-input"
      type="text"
      placeholder='Example: "Premium Outdoor Construction"'
      value={settings.logoSlogan || ""}
      onChange={(e) => update({ logoSlogan: e.target.value })}
    />
  </Field>
  <div className="micro" style={{ marginTop: 6 }}>
    Tip: keep it short (1 line).
  </div>
</div>

          </div>
        </SectionCard>

         {/* Proposal Sections */}
        <SectionCard
          title="Proposal Sections"
          subtitle="Enabled sections render on the Proposal page in this exact order."
          right={
            <>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {sectionsSavedMsg ? (
                <span style={{ fontWeight: 800, color: "#0b6b2f" }}>
                  {sectionsSavedMsg}
                </span>
              ) : null}

              {isAdmin ? (
                <>
                  <button
  type="button"
  className="ui-btn"
  onClick={async () => {
    if (!isAdmin) return;
    if (!orgId) return;

    setSectionsSaving(true);
    setSectionsError(null);
    setSectionsSavedMsg(null);

    try {
await upsertProposalSections(orgId, orderedSections);
      setSectionsDirty(false);
      setSectionsSavedMsg("Saved.");
      window.setTimeout(() => setSectionsSavedMsg(null), 2500);
    } catch (e: any) {
      setSectionsError(
        String(e?.message || e || "Failed to save proposal sections.")
      );
    } finally {
      setSectionsSaving(false);
    }
  }}
  disabled={!isAdmin || !orgId || sectionsSaving || sectionsLoading || !sectionsDirty}
  title={
    !orgId
      ? "No orgId yet"
      : !sectionsDirty
      ? "No changes to save"
      : "Save proposal sections"
  }
>
  {sectionsSaving ? "Saving..." : "Save"}
</button>


                  <button
                    type="button"
                    className="ui-btn"
                    onClick={addSection}
                    disabled={!orgId || sectionsSaving}
                  >
                    + Add Section
                  </button>
                </>
              ) : null}
            </div>
           
</>

          }
        >
          {!orgId ? (
            <div className="micro">
              OrgId not provided yet. (We will wire it from App.tsx if needed.)
            </div>
          ) : sectionsLoading ? (
            <div className="micro">Loading proposal sections...</div>
          ) : (
            <>
              {sectionsError ? (
                <div
                  className="micro"
                  style={{ color: "#b00020", fontWeight: 700, marginBottom: 10 }}
                >
                  {sectionsError}
                </div>
              ) : null}

              {!isAdmin ? (
                <div className="micro" style={{ marginBottom: 10 }}>
                  You have read-only access. Ask an admin to edit these sections.
                </div>
              ) : null}

              <div className="section-list">
                {mergedOrder.map((id, idx) => {
  // ✅ system items (Details / Timeline)
  if (id === "__details__" || id === "__timeline__") {
    const title = id === "__details__" ? "Details (System)" : "Timeline (System)";

    return (
      <div key={id} className="section-item">
        <div className="section-head">
          <div className="section-left">
            <label className="toggle">
              <input type="checkbox" checked={true} disabled />
              <span className="toggle-ui" />
            </label>

            <input
              className="ui-input section-title"
              value={title}
              disabled
              title="System section (always included)"
            />

            <select className="ui-select" value="paragraph" disabled>
              <option value="paragraph">System</option>
            </select>
          </div>

          <div className="section-actions">
            <button
              type="button"
              className="ui-btn ghost"
              disabled={!isAdmin || idx === 0}
              onClick={() => moveLayoutItem(id, -1)}
              title="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              className="ui-btn ghost"
              disabled={!isAdmin || idx === mergedOrder.length - 1}
              onClick={() => moveLayoutItem(id, 1)}
              title="Move down"
            >
              ↓
            </button>

            <button
              type="button"
              className="ui-btn danger ghost"
              disabled
              title="System section cannot be removed"
            >
              Remove
            </button>
          </div>
        </div>

        <div className="micro" style={{ marginTop: 10, opacity: 0.75 }}>
          This is a system section (always included). You can move it up/down in the proposal order.
        </div>
      </div>
    );
  }

  // ✅ normal custom sections
  const sec = sectionMap.get(id);
  if (!sec) return null;

  return (
    <div key={sec.id} className="section-item">
      <div className="section-head">
        <div className="section-left">
          <label className="toggle">
            <input
              type="checkbox"
              checked={!!sec.enabled}
              onChange={(e) =>
                updateSection(sec.id, {
                  enabled: e.target.checked,
                })
              }
              disabled={!isAdmin}
            />
            <span className="toggle-ui" />
          </label>

          <input
            className="ui-input section-title"
            value={sec.title || ""}
            onChange={(e) => updateSection(sec.id, { title: e.target.value })}
            placeholder="Section title"
            disabled={!isAdmin}
          />

          <select
            className="ui-select"
            value={sec.type}
            onChange={(e) =>
              updateSection(sec.id, {
                type: e.target.value as ProposalSectionType,
              })
            }
            disabled={!isAdmin}
          >
            <option value="bullets">Bullets</option>
            <option value="paragraph">Paragraph</option>
            <option value="reviews">Reviews</option>
          </select>
        </div>

        <div className="section-actions">
          <button
            type="button"
            className="ui-btn ghost"
            disabled={!isAdmin || idx === 0}
            onClick={() => moveLayoutItem(sec.id, -1)}
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            className="ui-btn ghost"
            disabled={!isAdmin || idx === mergedOrder.length - 1}
            onClick={() => moveLayoutItem(sec.id, 1)}
            title="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            className="ui-btn danger ghost"
            disabled={!isAdmin}
            onClick={() => removeSection(sec.id)}
            title="Remove"
          >
            Remove
          </button>
        </div>
      </div>

      {sec.type === "reviews" ? (
        <div className="grid-3 mt12">
          {/* keep your existing Reviews fields exactly as-is */}
          {/* (no change needed here) */}
        </div>
      ) : (
        <textarea
          className="ui-textarea mt12"
          value={sec.text || ""}
          onChange={(e) => updateSection(sec.id, { text: e.target.value })}
          rows={sec.type === "bullets" ? 5 : 6}
          placeholder={
            sec.type === "bullets" ? "One bullet per line" : "Write a paragraph..."
          }
          disabled={!isAdmin}
        />
      )}
    </div>
  );
})}


              </div>
            </>
          )}
        </SectionCard>


        {/* Scope of Work */}
        <section className="settings-card">
          <div className="settings-card-title">SCOPE TEMPLATES</div>
          <div className="settings-card-subtitle">
            Shared Scope of Work templates stored in Supabase. Admin can edit. Users are read-only.
          </div>

          <div style={{ display: "flex", gap: 14, marginTop: 12, alignItems: "flex-start" }}>
            {/* LEFT: Add + Dropdown */}
            <div style={{ width: 320, flex: "0 0 320px" }}>
              {isAdmin ? (
                <button type="button" className="btn btn-secondary" onClick={onAddSowTemplate}>
                  + Add Construction Type
                </button>
              ) : null}

              <div style={{ marginTop: 12 }}>
                {sowLoading ? (
                  <div style={{ opacity: 0.7 }}>Loading templates…</div>
                ) : sowError ? (
                  <div style={{ opacity: 0.7 }}>{sowError}</div>
                ) : sowRows.length === 0 ? (
                  <div style={{ opacity: 0.7 }}>No scope templates yet.</div>
                ) : (
                  <select
                    value={selectedSowKey}
                    onChange={(e) => setSelectedSowKey(e.target.value)}
                    style={{ width: "100%", padding: 10, borderRadius: 10 }}
                  >
                    {sowRows.map((r) => (
                      <option key={r.construction_key} value={r.construction_key}>
                        {r.label} ({r.construction_key})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* RIGHT: Editor */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {!selectedSowRow ? (
                <div style={{ opacity: 0.7, marginTop: 6 }}>Pick a type from the dropdown to edit.</div>
              ) : (
                <>
                  <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
                    <label style={{ fontWeight: 700 }}>Label</label>
                    <input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      disabled={!isAdmin}
                      style={{ width: "100%", padding: 10, borderRadius: 10 }}
                      placeholder="Ex: New Construction"
                    />
                  </div>

                  <div style={{ display: "grid", gap: 8 }}>
                    <label style={{ fontWeight: 700 }}>
                      Template Text (AUTO scope shown on proposals)
                    </label>
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      disabled={!isAdmin}
                      rows={10}
                      style={{ width: "100%", padding: 10, borderRadius: 10 }}
                      placeholder="Type the Scope of Work template here…"
                    />
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    {isAdmin ? (
                      <>
                        <button type="button" className="btn btn-primary" onClick={onSaveSowTemplate}>
                          Save
                        </button>
                        <button type="button" className="btn btn-outline" onClick={onDeleteSowTemplate}>
                          Delete
                        </button>
                      </>
                    ) : (
                      <div style={{ opacity: 0.7 }}>
                        You have read-only access. Ask an admin to update template language.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        <div className="settings-footer-spacer" />
      </div>
    </div>
  );
}
// ------------------------------
// Small UI helpers (same file)
// ------------------------------
function SectionCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">{title}</div>
          {subtitle ? <div className="card-sub">{subtitle}</div> : null}
        </div>
        {right ? <div className="card-right">{right}</div> : null}
      </div>
      <div className="card-body">{children}</div>
    </div>
  );
}

function Field({
  label,
  spanAll,
  children,
}: {
  label: string;
  spanAll?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`field ${spanAll ? "span-all" : ""}`}>
      <div className="field-label">{label}</div>
      {children}
    </label>
  );
}

/* NOTE: ScopeEditor kept below (unused right now), leaving as-is because it was in your file */
function ScopeEditor({
  scopeMap,
  onChange,
}: {
  scopeMap: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const keys = Object.keys(scopeMap || {}).sort();

  const [selectedKey, setSelectedKey] = React.useState<string>(() => keys[0] || "");

  // If keys change (add/remove), keep selection valid
  React.useEffect(() => {
    if (!keys.length) {
      setSelectedKey("");
      return;
    }
    if (!selectedKey || !keys.includes(selectedKey)) {
      setSelectedKey(keys[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join("|")]);

  const setKeyText = (key: string, val: string) => {
    onChange({ ...(scopeMap || {}), [key]: val });
  };

  const removeKey = (key: string) => {
    const next = { ...(scopeMap || {}) };
    delete next[key];
    onChange(next);
  };

  const addKey = () => {
    const k = prompt("Construction Type key (example: new, resurface, repair):", "new");
    if (!k) return;

    const key = k.trim();
    if (!key) return;

    // prevent duplicates
    if ((scopeMap || {})[key] !== undefined) {
      setSelectedKey(key);
      return;
    }

    const next = { ...(scopeMap || {}), [key]: "" };
    onChange(next);
    setSelectedKey(key);
  };

  return (
    <div className="scope">
      <div className="scope-top">
        <button type="button" className="ui-btn" onClick={addKey}>
          + Add Construction Type
        </button>
        <div className="micro">Pick a type from the dropdown to edit.</div>
      </div>

      {keys.length === 0 ? (
        <div className="empty">No scope templates yet.</div>
      ) : (
        <div className="scope-item">
          <div className="scope-head" style={{ gap: 10, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div className="field-label" style={{ marginBottom: 6 }}>
                Construction Type
              </div>

              <select
                className="ui-select"
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value)}
              >
                {keys.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="ui-btn danger ghost"
              onClick={() => selectedKey && removeKey(selectedKey)}
              disabled={!selectedKey}
              title="Remove this construction type"
              style={{ marginTop: 22 }}
            >
              Remove
            </button>
          </div>

          <textarea
            className="ui-textarea"
            value={selectedKey ? scopeMap[selectedKey] || "" : ""}
            onChange={(e) => selectedKey && setKeyText(selectedKey, e.target.value)}
            rows={7}
            placeholder="Paste scope of work text for this construction type..."
            disabled={!selectedKey}
          />
        </div>
      )}
    </div>
  );

}