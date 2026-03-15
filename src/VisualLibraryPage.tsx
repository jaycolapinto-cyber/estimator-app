import React, { useEffect, useMemo, useRef, useState } from "react";
import { uid } from "./utils/uid";
import { createClient } from "@supabase/supabase-js";
import {
  buildEstimateVisualSelections,
  buildVisualProductKey,
  matchVisualLibraryRecords,
  readVisualLibraryRecords,
  VISUAL_LIBRARY_PRIORITY_CATEGORIES,
  VisualLibraryRecord,
  writeVisualLibraryRecords,
} from "./visualLibrary";
import "./VisualLibraryPage.css";

// Supabase client (anon key is safe for client-side; bucket is public)
const SUPABASE_URL = "https://tozsbxtxurssvznreikr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvenNieHR4dXJzc3Z6bnJlaWtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5ODk4NTcsImV4cCI6MjA4MDU2NTg1N30.mQUI8eeiOlSFGIaye2SFnJhNt6EIU-bsBsHFhIhwv7s";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const STORAGE_BUCKET = "visual-library";

type ProductOption = {
  value: string;
  label: string;
};

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
  productOptionsByCategory: Record<string, ProductOption[]>;
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

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Unable to read image."));
    };
    reader.onerror = () => reject(reader.error || new Error("Unable to read image."));
    reader.readAsDataURL(file);
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Unable to process image."));
      },
      type,
      quality
    );
  });
}

async function optimizeImageForStorage(file: File): Promise<{ dataUrl: string; blob: Blob; width: number; height: number; contentType: string }> {
  const sourceUrl = await fileToDataUrl(file);
  const image = await loadImage(sourceUrl);
  const maxDimension = 1600;
  const longestSide = Math.max(image.width, image.height) || 1;
  const scale = Math.min(1, maxDimension / longestSide);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to process image.");

  context.drawImage(image, 0, 0, width, height);

  const hasAlpha = file.type === "image/png" || file.type === "image/webp";
  const type = hasAlpha ? "image/webp" : "image/jpeg";
  const qualitySteps = type === "image/jpeg" ? [0.82, 0.72, 0.62] : [0.82, 0.72, 0.62];
  const targetBytes = 350 * 1024;

  let bestBlob: Blob | null = null;
  for (const quality of qualitySteps) {
    const blob = await canvasToBlob(canvas, type, quality);
    bestBlob = blob;
    if (blob.size <= targetBytes) break;
  }

  if (!bestBlob) throw new Error("Unable to process image.");

  return {
    dataUrl: await fileToDataUrl(bestBlob),
    blob: bestBlob,
    width,
    height,
    contentType: type,
  };
}

function formatImageSourceLabel(imageRef: string): string {
  if (!imageRef.trim()) return "—";
  if (imageRef.startsWith("data:image/")) return "Uploaded image stored in this browser";
  return imageRef;
}

function uniqueOptions(options: ProductOption[]): ProductOption[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = option.value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function VisualLibraryPage({ estimateContext, productOptionsByCategory }: Props) {
  const [records, setRecords] = useState<VisualLibraryRecord[]>([]);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [imageStatus, setImageStatus] = useState<string>("");
  const [isReadingImage, setIsReadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const productOptions = useMemo(
    () => uniqueOptions(productOptionsByCategory[draft.category] || []),
    [draft.category, productOptionsByCategory]
  );

  const resetDraft = () => {
    setDraft(emptyDraft);
    setEditingId(null);
    setImageStatus("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCategoryChange = (category: string) => {
    const nextOptions = uniqueOptions(productOptionsByCategory[category] || []);
    setDraft((prev) => {
      // For Skirting, auto-label and hide the product selector
      if ((category || '').toLowerCase().includes('skirt')) {
        const displayName = 'Skirting Style';
        return {
          ...prev,
          category,
          displayName,
          productKey: buildVisualProductKey(category, displayName),
        };
      }

      const keepExisting = nextOptions.some((option) => option.value === prev.displayName);
      const displayName = keepExisting ? prev.displayName : "";
      return {
        ...prev,
        category,
        displayName,
        productKey: displayName ? buildVisualProductKey(category, displayName) : "",
      };
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      window.alert("Please choose an image file.");
      e.target.value = "";
      return;
    }

    setIsReadingImage(true);
    setImageStatus("");

    try {
      const optimized = await optimizeImageForStorage(file);
      // Upload optimized blob to Supabase Storage
      const category = (draft.category || "").trim() || "misc";
      const safeName = (draft.displayName || file.name || uid()).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const objectPath = `${category}/${Date.now()}-${safeName}.${optimized.contentType.includes("webp") ? "webp" : "jpg"}`;

      const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(objectPath, optimized.blob, {
        upsert: false,
        contentType: optimized.contentType,
      });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
      const publicUrl = pub?.publicUrl || "";

      setDraft((prev) => ({ ...prev, imageRef: publicUrl }));
      setImageStatus(`${file.name} uploaded to Supabase and linked.`);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Upload failed.");
      setImageStatus("");
    } finally {
      setIsReadingImage(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const category = draft.category.trim();
    const isSkirting = (category || '').toLowerCase().includes('skirt');
    const displayName = isSkirting ? 'Skirting Style' : draft.displayName.trim();
    const imageRef = draft.imageRef.trim();
    const caption = draft.caption.trim();
    const notes = draft.notes.trim();

    // Always build productKey from canonicalized category + displayName
    const productKey = buildVisualProductKey(category, displayName).trim();

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
      return [nextRecord, ...withoutCurrent].sort(
        (a, b) => a.category.localeCompare(b.category) || a.displayName.localeCompare(b.displayName)
      );
    });

    resetDraft();
  };

  const handleEdit = (record: VisualLibraryRecord) => {
    setEditingId(record.id);
    const isSkirting = (record.category || '').toLowerCase().includes('skirt');
    const displayName = isSkirting ? 'Skirting Style' : (record.displayName || '');
    setDraft({
      category: record.category,
      productKey: buildVisualProductKey(record.category, displayName),
      displayName,
      imageRef: record.imageRef,
      caption: record.caption || "",
      notes: record.notes || "",
    });
    setImageStatus(record.imageRef.startsWith("data:image/") ? "This record uses an uploaded browser-stored image." : "");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = (id: string) => {
    setRecords((prev) => prev.filter((item) => item.id !== id));
    if (editingId === id) resetDraft();
  };

  return (
    <section className="vl-page">
      <div className="vl-hero">
        <div>
          <div className="vl-eyebrow">Proposal visuals</div>
          <h2 className="vl-hero__title">Visual Library</h2>
          <div className="vl-hero__text">
            Upload product images once, keep naming aligned with the Estimator, and proposal appendices will map automatically.
          </div>
        </div>
        <div className="vl-pills">
          <div className="vl-pill">Categories: {VISUAL_LIBRARY_PRIORITY_CATEGORIES.join(" • ")}</div>
          <div className="vl-pill">Library records: {records.length}</div>
          <div className="vl-pill vl-pill--success">Current estimate matches: {mappedRecords.length}</div>
        </div>
      </div>

      <div className="vl-layout">
        <form onSubmit={handleSubmit} className="vl-card vl-card--form">
          <div className="vl-card__header">
            <div>
              <div className="vl-card__title">{editingId ? "Edit visual" : "Add visual"}</div>
              <div className="vl-card__subtitle">Product names come directly from the live Estimator option lists.</div>
            </div>
          </div>

          <label className="vl-field">
            <span>Category</span>
            <select value={draft.category} onChange={(e) => handleCategoryChange(e.target.value)}>
              {VISUAL_LIBRARY_PRIORITY_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          {!(draft.category || '').toLowerCase().includes('skirt') ? (
            <label className="vl-field">
              <span>Product name</span>
              <select
                value={draft.displayName}
                onChange={(e) => {
                  const displayName = e.target.value;
                  setDraft((prev) => ({
                    ...prev,
                    displayName,
                    productKey: displayName ? buildVisualProductKey(prev.category, displayName) : "",
                  }));
                }}
              >
                <option value="">Select a product</option>
                {productOptions.map((option) => (
                  <option key={`${draft.category}:${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <small>
                This list stays synced with the Estimator so proposal visual names always match the selectable products.
              </small>
            </label>
          ) : (
            <div className="vl-field">
              <span>Product name</span>
              <input value="Skirting Style" readOnly onChange={() => {}} />
              <small>Skirting visuals are grouped under a single style label. The Estimator stays unchanged.</small>
            </div>
          )}

          <label className="vl-field">
            <span>Product key</span>
            <input
              value={draft.productKey}
              onChange={(e) => setDraft((prev) => ({ ...prev, productKey: e.target.value }))}
              placeholder="decking:trex_transcend_-_spiced_rum"
            />
            <small>
              Auto-generated from category + product name. Leave it alone unless you need to remap an existing estimate selection.
            </small>
          </label>

          <div className="vl-upload-grid">
            <label className="vl-field">
              <span>Upload image</span>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} />
              <small>
                Uploaded images are stored locally in this browser so localhost testing stays simple.
              </small>
            </label>

            <label className="vl-field">
              <span>Or paste image URL/path</span>
              <input
                value={draft.imageRef}
                onChange={(e) => {
                  setDraft((prev) => ({ ...prev, imageRef: e.target.value }));
                  setImageStatus("");
                }}
                placeholder="https://... or /images/..."
              />
            </label>
          </div>

          {isReadingImage ? <div className="vl-status vl-status--info">Reading image…</div> : null}
          {imageStatus ? <div className="vl-status vl-status--success">{imageStatus}</div> : null}
          {draft.imageRef ? (
            <div className="vl-preview">
              <div className="vl-preview__label">Preview</div>
              <img src={draft.imageRef} alt={draft.displayName || "Visual preview"} className="vl-preview__image" />
            </div>
          ) : null}

          <label className="vl-field">
            <span>Customer caption</span>
            <input
              value={draft.caption}
              onChange={(e) => setDraft((prev) => ({ ...prev, caption: e.target.value }))}
              placeholder="Optional line shown on the proposal visual page"
            />
          </label>

          <label className="vl-field">
            <span>Internal notes</span>
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Source link, crop reminder, etc."
              rows={5}
            />
          </label>

          <div className="vl-actions">
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

        <div className="vl-stack">
          <div className="vl-card">
            <div className="vl-card__header">
              <div>
                <div className="vl-card__title">Estimate product mapping preview</div>
                <div className="vl-card__subtitle">See which current selections already have proposal visuals ready.</div>
              </div>
            </div>
            {estimateSelections.length === 0 ? (
              <div className="vl-empty">Open an estimate with decking, railing, or skirting selected to preview proposal visual matches.</div>
            ) : (
              <div className="vl-list">
                {estimateSelections.map((item) => {
                  const matched = mappedRecords.find((record) => record.productKey === item.productKey);
                  return (
                    <div key={item.productKey} className="vl-row">
                      <div>
                        <div className="vl-row__title">{item.category}</div>
                        <div>{item.label}</div>
                        <div className="vl-row__meta">{item.productKey}</div>
                      </div>
                      <div className={matched ? "vl-badge vl-badge--success" : "vl-badge vl-badge--danger"}>
                        {matched ? "Ready for proposal appendix" : "Missing visual"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="vl-card">
            <div className="vl-card__header">
              <div>
                <div className="vl-card__title">Library records</div>
                <div className="vl-card__subtitle">Saved visuals are grouped in a cleaner review list for quick maintenance.</div>
              </div>
            </div>
            {records.length === 0 ? (
              <div className="vl-empty">No visuals saved yet.</div>
            ) : (
              <div className="vl-records">
                {records.map((record) => {
                  const isMatched = mappedRecords.some((item) => item.id === record.id);
                  return (
                    <div key={record.id} className="vl-record">
                      <div className="vl-record__main">
                        {record.imageRef ? (
                          <img src={record.imageRef} alt={record.displayName} className="vl-record__thumb" />
                        ) : (
                          <div className="vl-record__thumb vl-record__thumb--empty">No image</div>
                        )}
                        <div className="vl-record__content">
                          <div className="vl-record__heading">
                            <strong>{record.displayName}</strong>
                            <span className="vl-tag">{record.category}</span>
                            {isMatched && <span className="vl-tag vl-tag--success">Used in current estimate</span>}
                          </div>
                          <div className="vl-row__meta">Key: {record.productKey}</div>
                          <div className="vl-row__meta">Image: {formatImageSourceLabel(record.imageRef)}</div>
                          {record.caption ? <div className="vl-record__caption">{record.caption}</div> : null}
                          {record.notes ? <div className="vl-record__notes">{record.notes}</div> : null}
                        </div>
                      </div>
                      <div className="vl-actions vl-actions--compact">
                        <button type="button" className="btn" onClick={() => handleEdit(record)}>
                          Edit
                        </button>
                        <button type="button" className="btn" onClick={() => handleDelete(record.id)}>
                          Delete
                        </button>
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
