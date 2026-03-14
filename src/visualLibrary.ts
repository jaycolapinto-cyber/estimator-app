export type VisualLibraryRecord = {
  id: string;
  category: string;
  productKey: string;
  displayName: string;
  imageRef: string;
  caption?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type EstimateVisualSelection = {
  category: string;
  productKey: string;
  label: string;
};

export const VISUAL_LIBRARY_STORAGE_KEY = "du_visual_library_records_v1";
export const VISUAL_LIBRARY_PRIORITY_CATEGORIES = [
  "Decking",
  "Railing",
  "Skirting / Lattice",
] as const;

function normalize(value: string): string {
  return (value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
}

export function buildVisualProductKey(category: string, name: string): string {
  return `${normalize(category)}:${normalize(name)}`;
}

export function readVisualLibraryRecords(): VisualLibraryRecord[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(VISUAL_LIBRARY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeVisualLibraryRecords(records: VisualLibraryRecord[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(VISUAL_LIBRARY_STORAGE_KEY, JSON.stringify(records));
}

export function buildEstimateVisualSelections(input: {
  deckingType?: string;
  railingType?: string;
  skirtingType?: string;
}): EstimateVisualSelection[] {
  const base: EstimateVisualSelection[] = [
    {
      category: "Decking",
      label: input.deckingType || "",
      productKey: buildVisualProductKey("Decking", input.deckingType || ""),
    },
    {
      category: "Railing",
      label: input.railingType || "",
      productKey: buildVisualProductKey("Railing", input.railingType || ""),
    },
    {
      category: "Skirting / Lattice",
      label: input.skirtingType || "",
      productKey: buildVisualProductKey("Skirting / Lattice", input.skirtingType || ""),
    },
  ].filter((item) => item.label.trim());

  const deduped = new Map<string, EstimateVisualSelection>();
  base.forEach((item) => {
    if (!item.label.trim()) return;
    deduped.set(item.productKey, item);
  });

  return Array.from(deduped.values());
}

export function matchVisualLibraryRecords(
  records: VisualLibraryRecord[],
  selections: EstimateVisualSelection[]
): VisualLibraryRecord[] {
  const wanted = new Set(selections.map((item) => item.productKey));
  return records.filter((record) => wanted.has(record.productKey));
}
