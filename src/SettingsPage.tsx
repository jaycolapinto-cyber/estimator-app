// SettingsPage.tsx
// ✅ Prepared By fields
// ✅ Logo upload (stored in localStorage via App's userSettings persistence)
// ✅ Proposal Sections builder (add / rename / reorder / enable / remove)
// ✅ Scope of Work text by Construction Type (optional)

import React, { useEffect, useMemo, useState } from "react";
import "./SettingsPage.css";
import {
  fetchSowTemplatesRows,
  upsertSowTemplate,
  deleteSowTemplate,
  SowTemplateFullRow,
} from "./sowTemplates";

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

  proposalSections?: ProposalSection[];

  scopeOfWorkByConstructionType?: Record<string, string>;
};

type SettingsPageProps = {
  userSettings: UserSettings;
  setUserSettings: React.Dispatch<React.SetStateAction<UserSettings>>;
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

function ensureDefaults(prev: UserSettings): UserSettings {
  const next: UserSettings = { ...(prev || {}) };

  if (
    !Array.isArray(next.proposalSections) ||
    next.proposalSections.length === 0
  ) {
    next.proposalSections = DEFAULT_SECTIONS.map((s) => ({ ...s, id: uid() }));
  }

  if (!next.scopeOfWorkByConstructionType) {
    next.scopeOfWorkByConstructionType = {};
  }
  if (!next.emailSubjectTemplate) {
    next.emailSubjectTemplate =
      "Your Decks Unique Proposal – {{clientLastName}}";
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
}: SettingsPageProps) {
  // =========================================================
  // SOW TEMPLATES (shared in Supabase)
  // =========================================================

  // ✅ TEMP: set this to true for now so you can edit
  // Later we will wire it to real admin logic
  const isAdmin = true;

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
      if (
        selectedSowKey &&
        !rows.some((r) => r.construction_key === selectedSowKey)
      ) {
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

    const label =
      window.prompt("Enter a label (example: New Construction)") || key;

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

    const ok = window.confirm(
      `Delete template "${selectedSowKey}"? This cannot be undone.`
    );
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

  // ✅ Ensure defaults whenever settings are missing pieces (safe + predictable)
  useEffect(() => {
    setUserSettings((prev) => ensureDefaults(prev || userSettings || {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settings = useMemo(
    () => ensureDefaults(userSettings || {}),
    [userSettings]
  );

  const update = (patch: Partial<UserSettings>) => {
    setUserSettings((prev) => ({ ...(prev || {}), ...patch }));
  };

  const sections = settings.proposalSections || [];

  const updateSection = (id: string, patch: Partial<ProposalSection>) => {
    update({
      proposalSections: sections.map((s) =>
        s.id === id ? { ...s, ...patch } : s
      ),
    });
  };

  const addSection = () => {
    const next: ProposalSection = {
      id: uid(),
      title: "New Section",
      enabled: true,
      type: "bullets",
      text: "• Item one\n• Item two",
    };
    update({ proposalSections: [...sections, next] });
  };

  const removeSection = (id: string) => {
    update({ proposalSections: sections.filter((s) => s.id !== id) });
  };

  const moveSection = (id: string, dir: -1 | 1) => {
    const idx = sections.findIndex((s) => s.id === id);
    if (idx < 0) return;

    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= sections.length) return;

    const next = [...sections];
    [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
    update({ proposalSections: next });
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
        <div className="settings-h1">Settings</div>
        <div className="settings-sub">
          Proposal branding + section builder + scope templates.
        </div>
      </div>

      <div className="settings-content">
        {/* Prepared By */}
        <SectionCard
          title="Prepared By"
          subtitle="These fields appear on your proposal header."
        >
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
                onChange={(e) =>
                  update({ emailSubjectTemplate: e.target.value })
                }
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
            Available placeholders: {"{{clientTitle}}"} {"{{clientFirstName}}"}{" "}
            {"{{clientLastName}}"} {"{{clientEmail}}"} {"{{userName}}"}{" "}
            {"{{userPhone}}"} {"{{companyName}}"}
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
                <img
                  src={settings.logoDataUrl}
                  alt="Logo"
                  className="logo-img"
                />
              ) : (
                <div className="logo-empty">No logo</div>
              )}
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
              <div className="micro">
                Tip: keep it wide, not tall. Transparent background looks best.
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Proposal Sections */}
        <SectionCard
          title="Proposal Sections"
          subtitle="Enabled sections render on the Proposal page in this exact order."
          right={
            <button type="button" className="ui-btn" onClick={addSection}>
              + Add Section
            </button>
          }
        >
          <div className="section-list">
            {sections.map((sec, idx) => (
              <div key={sec.id} className="section-item">
                <div className="section-head">
                  <div className="section-left">
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={!!sec.enabled}
                        onChange={(e) =>
                          updateSection(sec.id, { enabled: e.target.checked })
                        }
                      />
                      <span className="toggle-ui" />
                    </label>

                    <input
                      className="ui-input section-title"
                      value={sec.title || ""}
                      onChange={(e) =>
                        updateSection(sec.id, { title: e.target.value })
                      }
                      placeholder="Section title"
                    />

                    <select
                      className="ui-select"
                      value={sec.type}
                      onChange={(e) =>
                        updateSection(sec.id, {
                          type: e.target.value as ProposalSectionType,
                        })
                      }
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
                      disabled={idx === 0}
                      onClick={() => moveSection(sec.id, -1)}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="ui-btn ghost"
                      disabled={idx === sections.length - 1}
                      onClick={() => moveSection(sec.id, 1)}
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="ui-btn danger ghost"
                      onClick={() => removeSection(sec.id)}
                      title="Remove"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {sec.type === "reviews" ? (
                  <div className="grid-3 mt12">
                    <Field label="Company">
                      <input
                        className="ui-input"
                        value={sec.reviews?.company || ""}
                        onChange={(e) =>
                          updateSection(sec.id, {
                            reviews: {
                              ...(sec.reviews || {}),
                              company: e.target.value,
                            },
                          })
                        }
                        placeholder="Decks Unique, Inc."
                      />
                    </Field>

                    <Field label="Rating">
                      <input
                        className="ui-input"
                        value={sec.reviews?.rating || ""}
                        onChange={(e) =>
                          updateSection(sec.id, {
                            reviews: {
                              ...(sec.reviews || {}),
                              rating: e.target.value,
                            },
                          })
                        }
                        placeholder="5.0"
                      />
                    </Field>

                    <Field label="Count">
                      <input
                        className="ui-input"
                        value={sec.reviews?.count || ""}
                        onChange={(e) =>
                          updateSection(sec.id, {
                            reviews: {
                              ...(sec.reviews || {}),
                              count: e.target.value,
                            },
                          })
                        }
                        placeholder="(222)"
                      />
                    </Field>

                    <Field label="Subtitle" spanAll>
                      <input
                        className="ui-input"
                        value={sec.reviews?.subtitle || ""}
                        onChange={(e) =>
                          updateSection(sec.id, {
                            reviews: {
                              ...(sec.reviews || {}),
                              subtitle: e.target.value,
                            },
                          })
                        }
                        placeholder="Rated 5.0 on Google with 200+ Reviews"
                      />
                    </Field>

                    <Field label="Location line" spanAll>
                      <input
                        className="ui-input"
                        value={sec.reviews?.location || ""}
                        onChange={(e) =>
                          updateSection(sec.id, {
                            reviews: {
                              ...(sec.reviews || {}),
                              location: e.target.value,
                            },
                          })
                        }
                        placeholder="Deck builder in Commack"
                      />
                    </Field>
                  </div>
                ) : (
                  <textarea
                    className="ui-textarea mt12"
                    value={sec.text || ""}
                    onChange={(e) =>
                      updateSection(sec.id, { text: e.target.value })
                    }
                    rows={sec.type === "bullets" ? 5 : 6}
                    placeholder={
                      sec.type === "bullets"
                        ? "One bullet per line"
                        : "Write a paragraph..."
                    }
                  />
                )}
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Scope of Work */}
        {/* ===========================
    SCOPE TEMPLATES (SOW)
   =========================== */}
        <section className="settings-card">
          <div className="settings-card-title">SCOPE TEMPLATES</div>
          <div className="settings-card-subtitle">
            Shared Scope of Work templates stored in Supabase. Admin can edit.
            Users are read-only.
          </div>

          <div
            style={{
              display: "flex",
              gap: 14,
              marginTop: 12,
              alignItems: "flex-start",
            }}
          >
            {/* LEFT: Add + Dropdown */}
            <div style={{ width: 320, flex: "0 0 320px" }}>
              {isAdmin ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onAddSowTemplate}
                >
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
                      <option
                        key={r.construction_key}
                        value={r.construction_key}
                      >
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
                <div style={{ opacity: 0.7, marginTop: 6 }}>
                  Pick a type from the dropdown to edit.
                </div>
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
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={onSaveSowTemplate}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={onDeleteSowTemplate}
                        >
                          Delete
                        </button>
                      </>
                    ) : (
                      <div style={{ opacity: 0.7 }}>
                        You have read-only access. Ask an admin to update
                        template language.
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

function ScopeEditor({
  scopeMap,
  onChange,
}: {
  scopeMap: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const keys = Object.keys(scopeMap || {}).sort();

  const [selectedKey, setSelectedKey] = React.useState<string>(
    () => keys[0] || ""
  );

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
    const k = prompt(
      "Construction Type key (example: new, resurface, repair):",
      "new"
    );
    if (!k) return;

    const key = k.trim();
    if (!key) return;

    // prevent duplicates (case-sensitive; you can change if you want)
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
            onChange={(e) =>
              selectedKey && setKeyText(selectedKey, e.target.value)
            }
            rows={7}
            placeholder="Paste scope of work text for this construction type..."
            disabled={!selectedKey}
          />
        </div>
      )}
    </div>
  );
}
