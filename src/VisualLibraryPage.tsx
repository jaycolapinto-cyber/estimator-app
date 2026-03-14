import React, { useEffect, useMemo, useState } from "react";
import { uid } from "./utils/uid";
import {
  buildEstimateVisualSelections,
  buildVisualProductKey,
  matchVisualLibraryRecords,
  readVisualLibraryRecords,
  VISUAL_LIBRARY_PRIORITY_CATEGORIES,
  VisualLibraryRecord,
  writeVisualLibraryRecords,
} from "./visualLibrary";

type Props = {
  estimateContext: {
    deckingType?: string;
    railingType?: string;
    skirtingType?: string;
    stairsType?: string;
    demoType?: string;
    fastenerType?: string;
    addItemsDetailed?: Array<any>;
  };
};

type DraftState = {
  category: string;
  productKey: string;
  displayName: string;
  imageRef: string;
  caption: string;
  notes: string;
};

const DEFAULT_CATEGORY = VISUAL_LIBRARY_PRIORITY_CATEGORIES[0];

const emptyDraft: DraftState = {
  category: DEFAULT_CATEGORY,
  productKey: "",
  displayName: "",
  imageRef: "",
  caption: "",
  notes: "",
};

export default function VisualLibraryPage({ estimateContext }: Props) {
  const [records, setRecords] = useState<VisualLibraryRecord[]>([]);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setRecords(readVisualLibraryRecords());
  }, []);

  useEffect(() => {
    writeVisualLibraryRecords(records);
  }, [records]);

  const estimateSelections = useMemo(
    () => buildEstimateVisualSelections(estimateContext),
    [estimateContext]
  );

  const mappedRecords = useMemo(
    () => matchVisualLibraryRecords(records, estimateSelections),
    [records, estimateSelections]
  );

  const resetDraft = () => {
    setDraft(emptyDraft);
    setEditingId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const category = draft.category.trim();
    const displayName = draft.displayName.trim();
    const imageRef = draft.imageRef.trim();
    const caption = draft.caption.trim();
    const notes = draft.notes.trim();
    const productKey = (draft.productKey || buildVisualProductKey(category, displayName)).trim();

    if (!category || !displayName || !productKey) {
      window.alert("Category, product key, and display name are required.");
      return;
    }

    const now = new Date().toISOString();
    const nextRecord: VisualLibraryRecord = {
      id: editingId || uid(),
      category,
      productKey,
      displayName,
      imageRef,
      caption,
      notes,
      createdAt: records.find((item) => item.id === editingId)?.createdAt || now,
      updatedAt: now,
    };

    setRecords((prev) => {
      const withoutCurrent = prev.filter((item) => item.id !== nextRecord.id);
      return [nextRecord, ...withoutCurrent].sort((a, b) => a.category.localeCompare(b.category) || a.displayName.localeCompare(b.displayName));
    });

    resetDraft();
  };

  const handleEdit = (record: VisualLibraryRecord) => {
    setEditingId(record.id);
    setDraft({
      category: record.category,
      productKey: record.productKey,
      displayName: record.displayName,
      imageRef: record.imageRef,
      caption: record.caption || "",
      notes: record.notes || "",
    });
  };

  const handleDelete = (id: string) => {
    setRecords((prev) => prev.filter((item) => item.id !== id));
    if (editingId === id) resetDraft();
  };

  return (
    <section style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 14, opacity: 0.8 }}>
          Local-first proposal visual registry. MVP is intentionally limited to decking, railing, and skirting / lattice so proposal matching stays obvious.
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={pillStyle}>Categories: {VISUAL_LIBRARY_PRIORITY_CATEGORIES.join(" • ")}</div>
          <div style={pillStyle}>Library records: {records.length}</div>
          <div style={pillStyle}>Current estimate matches: {mappedRecords.length}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)", gap: 20, alignItems: "start" }}>
        <form onSubmit={handleSubmit} style={panelStyle}>
          <div style={panelTitleStyle}>{editingId ? "Edit visual" : "Add visual"}</div>

          <label style={fieldStyle}>
            <span>Category</span>
            <select value={draft.category} onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value, productKey: prev.displayName ? buildVisualProductKey(e.target.value, prev.displayName) : "" }))}>
              {VISUAL_LIBRARY_PRIORITY_CATEGORIES.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>

          <label style={fieldStyle}>
            <span>Display name</span>
            <input
              value={draft.displayName}
              onChange={(e) => {
                const displayName = e.target.value;
                setDraft((prev) => ({
                  ...prev,
                  displayName,
                  productKey: buildVisualProductKey(prev.category, displayName),
                }));
              }}
              placeholder="Trex Transcend - Spiced Rum"
            />
          </label>

          <label style={fieldStyle}>
            <span>Product key</span>
            <input
              value={draft.productKey}
              onChange={(e) => setDraft((prev) => ({ ...prev, productKey: e.target.value }))}
              placeholder="decking:trex_transcend_-_spiced_rum"
            />
            <small style={{ opacity: 0.7 }}>Auto-filled from category + display name. Override only if needed.</small>
          </label>

          <label style={fieldStyle}>
            <span>Image reference</span>
            <input value={draft.imageRef} onChange={(e) => setDraft((prev) => ({ ...prev, imageRef: e.target.value }))} placeholder="https://... or /images/..." />
          </label>

          <label style={fieldStyle}>
            <span>Customer caption</span>
            <input value={draft.caption} onChange={(e) => setDraft((prev) => ({ ...prev, caption: e.target.value }))} placeholder="Optional line shown on the proposal visual page" />
          </label>

          <label style={fieldStyle}>
            <span>Internal notes</span>
            <textarea value={draft.notes} onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Source link, crop reminder, etc." rows={5} />
          </label>

          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="btn btn-primary">
              {editingId ? "Update" : "Save"}
            </button>
            {(editingId || draft.displayName || draft.productKey || draft.imageRef || draft.caption || draft.notes) && (
              <button type="button" className="btn" onClick={resetDraft}>
                Clear
              </button>
            )}
          </div>
        </form>

        <div style={{ display: "grid", gap: 20 }}>
          <div style={panelStyle}>
            <div style={panelTitleStyle}>Estimate product mapping preview</div>
            {estimateSelections.length === 0 ? (
              <div style={{ opacity: 0.7 }}>Open an estimate with decking, railing, or skirting selected to preview proposal visual matches.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {estimateSelections.map((item) => {
                  const matched = mappedRecords.find((record) => record.productKey === item.productKey);
                  return (
                    <div key={item.productKey} style={rowStyle}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{item.category}</div>
                        <div>{item.label}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{item.productKey}</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: matched ? "#166534" : "#991b1b" }}>
                        {matched ? "Ready for proposal appendix" : "Missing visual"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={panelStyle}>
            <div style={panelTitleStyle}>Library records</div>
            {records.length === 0 ? (
              <div style={{ opacity: 0.7 }}>No visuals saved yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {records.map((record) => {
                  const isMatched = mappedRecords.some((item) => item.id === record.id);
                  return (
                    <div key={record.id} style={{ ...rowStyle, alignItems: "start" }}>
                      <div style={{ display: "grid", gap: 4 }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <strong>{record.displayName}</strong>
                          <span style={tagStyle}>{record.category}</span>
                          {isMatched && <span style={{ ...tagStyle, background: "#dcfce7", color: "#166534" }}>Used in current estimate</span>}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>Key: {record.productKey}</div>
                        <div style={{ fontSize: 12, opacity: 0.85 }}>Image: {record.imageRef || "—"}</div>
                        {record.caption ? <div style={{ fontSize: 13 }}>{record.caption}</div> : null}
                        {record.notes ? <div style={{ fontSize: 12, opacity: 0.8 }}>{record.notes}</div> : null}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" className="btn" onClick={() => handleEdit(record)}>Edit</button>
                        <button type="button" className="btn" onClick={() => handleDelete(record.id)}>Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

const panelStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  borderRadius: 16,
  padding: 18,
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  display: "grid",
  gap: 14,
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
};

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  padding: "12px 0",
  borderTop: "1px solid rgba(15, 23, 42, 0.08)",
};

const pillStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  background: "#eef2ff",
  color: "#3730a3",
  fontSize: 12,
  fontWeight: 700,
};

const tagStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: 999,
  background: "#e2e8f0",
  color: "#0f172a",
  fontSize: 12,
  fontWeight: 700,
};
