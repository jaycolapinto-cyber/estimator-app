// ProposalPage.tsx
// ✅ Header matches example: Prepared (left) | Logo (center) | Meta (right)
// ✅ No overlay, no reordering, no broken blocks
// ✅ Print uses hidden iframe and preserves layout

import React, { useEffect, useMemo, useRef, useState } from "react";
import "./ProposalPage.css";
import type { UserSettings, ProposalSection } from "./SettingsPage";
import { fetchSowTemplatesRows } from "./sowTemplates";
import { fetchProposalSections } from "./proposalSections";
import { supabase } from "./supabaseClient";


type AddItemRow = {
  rowId: string;
  qty?: number | null;
  unit?: string | null;
  lineBase?: number | null;

  picked?: { name: string; proposal_description?: string | null } | null;

  customName?: string | null;
  customDescription?: string | null;
  customQtyText?: string | null;

  isFixedPrice?: boolean;
  category?: string | null;
};

type ConstructionSowKey =
  | "new_construction"
  | "resurface"
  | "second_story"
  | "second_story_resurface"
  | "sleeper_system"
  | "second_story_sleeper";

function toSowKey(raw: string): ConstructionSowKey | "" {
  const v = (raw || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");

  if (v.includes("second") && v.includes("resurface"))
    return "second_story_resurface";
  if (v.includes("second") && v.includes("sleeper"))
    return "second_story_sleeper";
  if (v.includes("second")) return "second_story";
  if (v.includes("sleeper")) return "sleeper_system";
  if (v.includes("resurface") || v.includes("redeck")) return "resurface";
  if (v.includes("new")) return "new_construction";
  return "";
}

export type ProposalPageProps = {
  userSettings: UserSettings | null;
  estimateName: string;
  finalEstimate: number;
  orgId?: string | null;

  constructionType: string;

  clientTitle: string;
  clientLastName: string;
  clientTown: string;
  clientEmail: string;

  deckingType?: string | null;
  railingType?: string | null;
  stairsType?: string | null;
  fastenerType?: string | null;
  demoType?: string | null;
  skirtingType?: string | null;
  deckingDescription?: string | null;
  railingDescription?: string | null;
  stairsDescription?: string | null;
  fastenerDescription?: string | null;
  demoDescription?: string | null;
  skirtingDescription?: string | null;

  deckingSubtotal: number;
  railingSubtotal: number;
  stairsSubtotal: number;
  fastenerSubtotal: number;
  demoSubtotal: number;
  skirtingSubtotal: number;

  deckingQty?: number | null;
  deckingUnit?: string | null;
  railingQty?: number | null;
  railingUnit?: string | null;
  stairsQty?: number | null;
  stairsUnit?: string | null;
  fastenerQty?: number | null;
  fastenerUnit?: string | null;
  demoQty?: number | null;
  demoUnit?: string | null;
  skirtingQty?: number | null;
  skirtingUnit?: string | null;

  addItemsDetailed: AddItemRow[];

  upliftMultiplier: number;
  onSectionsSnapshot?: (sections: ProposalSection[]) => void;

  defaultShowLineItemPrices?: boolean;
  onEmailProposal?: () => void;
  readOnly?: boolean;
  proposalSectionsSnapshot?: ProposalSection[] | null;

  proposalId?: string | null;

  proposalNotesSnapshot?: string | null;
  sowModeSnapshot?: "auto" | "custom" | null;
  sowCustomTextSnapshot?: string | null;
  startWeeksSnapshot?: number | null;
  durationDaysSnapshot?: number | null;
  showLineItemPricesSnapshot?: boolean | null;
};
function formatStartWeeksRange(weeks: number) {
  if (weeks <= 1) return "1 week";
  if (weeks === 2) return "2 weeks";
  if (weeks === 3) return "3 weeks";
  if (weeks === 4) return "4 weeks";
  if (weeks <= 6) return "5–6 weeks";
  if (weeks <= 8) return "7–8 weeks";
  return `${weeks} weeks`;
}

function formatDurationRange(days: number) {
  if (days <= 2) return "1–2 days";
  if (days <= 5) return "3–5 days";
  if (days <= 6) return "4–6 days";
  if (days <= 10) return "7–10 days";
  return "10+ days";
}

function money0(n: number) {
  return Math.round(n || 0).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

// Normalize legacy / system layout ids so ProposalPage matches SettingsPage
const normalizeLayoutId = (idRaw: any): string => {
  const id = String(idRaw || "").trim();
  if (id === "_details_") return "__details__";
  if (id === "_timeline_") return "__timeline__";
  return id;
};

function fmtQty(
  qty?: number | null,
  unit?: string | null,
  name?: string | null,
  category?: string | null
) {
  const q = typeof qty === "number" && isFinite(qty) ? qty : null;
  if (q == null || q <= 0) return "";

  const qStr = Number.isInteger(q)
    ? String(q)
    : q.toLocaleString(undefined, { maximumFractionDigits: 2 });

  const u0 = (unit || "").trim().toLowerCase();
  if (!u0) return qStr;

  if (u0 === "multiplier") {
    const n = (name || "").toLowerCase();
    const c = (category || "").toLowerCase();

    if (n.includes(" sf")) return `${qStr} SF`;
    if (n.includes(" lf")) return `${qStr} LF`;
    if (n.includes(" ea")) return `${qStr} EA`;

    if (c.includes("deck") || c.includes("skirting") || c.includes("lattice"))
      return `${qStr} SF`;
    if (c.includes("rail")) return `${qStr} LF`;

    return qStr;
  }

  return `${qStr} ${u0}`;
}

function bulletLines(text?: string | null) {
  return (text || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function ProposalPage(props: ProposalPageProps) {
    // ============================
  // ============================
  // 🔒 Freeze proposal rendering (no live updates)
  // ============================
  const latestPropsRef = useRef<ProposalPageProps>(props);
  latestPropsRef.current = props;

  const [proposalSnapshot, setProposalSnapshot] = useState<ProposalPageProps>(() => props);

  // 📬 Email tracking (opened / clicked)
  const [emailTrackingLoading, setEmailTrackingLoading] = useState(false);
  const [emailOpenedAt, setEmailOpenedAt] = useState<string | null>(null);
  const [emailClickedAt, setEmailClickedAt] = useState<string | null>(null);
  const [emailOpenedCount, setEmailOpenedCount] = useState(0);
  const [emailClickedCount, setEmailClickedCount] = useState(0);
  const [emailLastCheckedAt, setEmailLastCheckedAt] = useState<Date | null>(null);

  const loadEmailTracking = async () => {
    const pid = (props.proposalId || "").trim();
    if (!pid) return;
    setEmailTrackingLoading(true);
    try {
      const { data, error } = await supabase
        .from("proposal_email_events")
        .select("event_type, occurred_at")
        .eq("proposal_id", pid)
        .order("occurred_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      const events = Array.isArray(data) ? data : [];
      const openedEvents = events.filter((e: any) =>
        String(e?.event_type || "").includes("opened")
      );
      const clickedEvents = events.filter((e: any) =>
        String(e?.event_type || "").includes("clicked")
      );

      setEmailOpenedCount(openedEvents.length);
      setEmailClickedCount(clickedEvents.length);
      setEmailOpenedAt(openedEvents[0]?.occurred_at || null);
      setEmailClickedAt(clickedEvents[0]?.occurred_at || null);
      setEmailLastCheckedAt(new Date());
    } catch {
      // silent fail; tracking depends on webhook delivery
    } finally {
      setEmailTrackingLoading(false);
    }
  };

  // 🔔 Track if proposal is out-of-date
  const [needsRefresh, setNeedsRefresh] = useState(false);
const liveUserSettings = props.userSettings;
  // Re-fetch sections + re-render proposal ONLY when user clicks refresh
  const [proposalRefreshKey, setProposalRefreshKey] = useState(0);
const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(() => new Date());
  const refreshProposal = () => {
    setProposalSnapshot(latestPropsRef.current);
    setProposalRefreshKey((k) => k + 1);
    setNeedsRefresh(false);
    setLastRefreshedAt(new Date());
  };

  // ✅ Auto-refresh when switching to a different estimate (fresh context)
  useEffect(() => {
    setProposalSnapshot(latestPropsRef.current);
    setProposalRefreshKey((k) => k + 1);
    setNeedsRefresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestPropsRef.current.estimateName]);

  // ✅ Load email tracking for this proposal
  useEffect(() => {
    if (!props.proposalId) return;
    loadEmailTracking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.proposalId]);
  // ✅ Build a lightweight signature of the proposal inputs (so we can detect stale snapshot)
  const liveSig = useMemo(() => {
    return JSON.stringify({
      finalEstimate: props.finalEstimate,
      deckingType: props.deckingType,
      railingType: props.railingType,
      stairsType: props.stairsType,
      fastenerType: props.fastenerType,
      demoType: props.demoType,
      skirtingType: props.skirtingType,
      addItemsCount: (props.addItemsDetailed || []).length,
    });
  }, [
    props.finalEstimate,
    props.deckingType,
    props.railingType,
    props.stairsType,
    props.fastenerType,
    props.demoType,
    props.skirtingType,
    props.addItemsDetailed,
  ]);

  const snapSig = useMemo(() => {
    return JSON.stringify({
      finalEstimate: proposalSnapshot.finalEstimate,
      deckingType: proposalSnapshot.deckingType,
      railingType: proposalSnapshot.railingType,
      stairsType: proposalSnapshot.stairsType,
      fastenerType: proposalSnapshot.fastenerType,
      demoType: proposalSnapshot.demoType,
      skirtingType: proposalSnapshot.skirtingType,
      addItemsCount: (proposalSnapshot.addItemsDetailed || []).length,
    });
  }, [
    proposalSnapshot.finalEstimate,
    proposalSnapshot.deckingType,
    proposalSnapshot.railingType,
    proposalSnapshot.stairsType,
    proposalSnapshot.fastenerType,
    proposalSnapshot.demoType,
    proposalSnapshot.skirtingType,
    proposalSnapshot.addItemsDetailed,
  ]);
    useEffect(() => {
    setNeedsRefresh(liveSig !== snapSig);
  }, [liveSig, snapSig]);

  
  const {
    orgId,
    userSettings,
    estimateName,
    finalEstimate,
    constructionType,

    clientTitle,
    clientLastName,
    clientTown,
    clientEmail,

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

    deckingSubtotal,
    railingSubtotal,
    stairsSubtotal,
    fastenerSubtotal,
    demoSubtotal,
    skirtingSubtotal,

    deckingQty,
    deckingUnit,
    railingQty,
    railingUnit,
    stairsQty,
    stairsUnit,
    fastenerQty,
    fastenerUnit,
    demoQty,
    demoUnit,
    skirtingQty,
    skirtingUnit,
    onEmailProposal,

    addItemsDetailed,
    upliftMultiplier,
    defaultShowLineItemPrices,
    readOnly,

    proposalNotesSnapshot,
    sowModeSnapshot,
    sowCustomTextSnapshot,
    startWeeksSnapshot,
    durationDaysSnapshot,
    showLineItemPricesSnapshot,
    proposalSectionsSnapshot,
    

} = proposalSnapshot;
  const docRef = useRef<HTMLElement | null>(null);

  // PRINT: set total pages in footer ("Page 1 of Y")
  useEffect(() => {
    const onBeforePrint = () => {
      const el = document.getElementById("proposal-doc");
      if (!el) return;

      // page height in px for Letter at 96dpi minus browser margins is variable,
      // so we measure based on viewport print layout approximation.
      // This is a lightweight estimate that's stable enough for proposals.
      const pagePx = 1056; // ~11in * 96dpi
      const total = Math.max(1, Math.ceil(el.scrollHeight / pagePx));

      const curEl = document.getElementById("du-page-cur");
      const totalEl = document.getElementById("du-page-total");
      if (curEl) curEl.textContent = "1";
      if (totalEl) totalEl.textContent = String(total);
    };

    window.addEventListener("beforeprint", onBeforePrint);
    return () => window.removeEventListener("beforeprint", onBeforePrint);
  }, []);

  const safeOrgId = orgId ?? null;

// 🔔 Detect when estimator changes (mark proposal stale)
useEffect(() => {
  if (props.finalEstimate !== proposalSnapshot.finalEstimate) {
    setNeedsRefresh(true);
  }
}, [props.finalEstimate, proposalSnapshot.finalEstimate]);
  const [dbProposalSections, setDbProposalSections] = useState<
    ProposalSection[]
  >([]);

 useEffect(() => {
  let alive = true;

  (async () => {
    if (readOnly) {
      setDbProposalSections([]);
      return;
    }

    if (!safeOrgId) {
      setDbProposalSections([]);
      return;
    }

    try {
      const rows = await fetchProposalSections(safeOrgId);
      if (!alive) return;
      const next = Array.isArray(rows) ? rows : [];
      setDbProposalSections(next);
      props.onSectionsSnapshot?.(next);
    } catch {
      if (!alive) return;
      setDbProposalSections([]);
    }
  })();

  return () => {
    alive = false;
  };
}, [safeOrgId, readOnly, proposalRefreshKey]);

  const [showLineItemPrices, setShowLineItemPrices] = useState<boolean>(() => {
    if (readOnly && typeof showLineItemPricesSnapshot === "boolean") {
      return showLineItemPricesSnapshot;
    }
    return !!defaultShowLineItemPrices;
  });

  // Timeline
  const [startWeeks, setStartWeeks] = useState<number>(() => {
    try {
      if (readOnly && Number.isFinite(Number(startWeeksSnapshot))) {
        return Number(startWeeksSnapshot);
      }
      const v = localStorage.getItem(
        `du_timeline_start_weeks::${estimateName}`
      );
      const n = Number(v);
      return Number.isFinite(n) && n >= 1 ? n : 3;
    } catch {
      return 3;
    }
  });

  const [durationDays, setDurationDays] = useState<number>(() => {
    try {
      if (readOnly && Number.isFinite(Number(durationDaysSnapshot))) {
        return Number(durationDaysSnapshot);
      }
      const v = localStorage.getItem(
        `du_timeline_duration_days::${estimateName}`
      );
      const n = Number(v);
      return Number.isFinite(n) && n >= 1 ? n : 2;
    } catch {
      return 2;
    }
  });

  useEffect(() => {
    if (readOnly) return;
    try {
      localStorage.setItem(
        `du_timeline_start_weeks::${estimateName}`,
        String(startWeeks)
      );
    } catch {}
  }, [startWeeks, estimateName, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    try {
      localStorage.setItem(
        `du_timeline_duration_days::${estimateName}`,
        String(durationDays)
      );
    } catch {}
  }, [durationDays, estimateName, readOnly]);

  // Notes
  const NOTES_KEY =
    estimateName && estimateName.trim()
      ? `du_proposal_notes::${estimateName}`
      : "";

  const [proposalNotes, setProposalNotes] = useState<string>(() => {
    if (readOnly && proposalNotesSnapshot != null) {
      return String(proposalNotesSnapshot || "");
    }
    return "";
  });

  useEffect(() => {
    if (readOnly) return;
    if (!NOTES_KEY) {
      setProposalNotes("");
      return;
    }
    try {
      const saved = localStorage.getItem(NOTES_KEY) || "";
      setProposalNotes(saved);
    } catch {
      setProposalNotes("");
    }
  }, [NOTES_KEY, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    if (!NOTES_KEY) return;
    try {
      localStorage.setItem(NOTES_KEY, proposalNotes || "");
    } catch {}
  }, [NOTES_KEY, proposalNotes, readOnly]);

  const lineTotal = (baseCost: number, isFixedPrice?: boolean) =>
    (baseCost || 0) * (isFixedPrice ? 1 : upliftMultiplier || 1);

  // SOW
  const sowKey = useMemo(() => toSowKey(constructionType), [constructionType]);

  const [sowTemplatesMap, setSowTemplatesMap] = useState<
    Record<string, string>
  >(() => {
    try {
      return JSON.parse(localStorage.getItem("du_sow_templates_v1") || "{}");
    } catch {
      return {};
    }
  });

  useEffect(() => {
    (async () => {
      try {
        const rows = await fetchSowTemplatesRows();
        const map: Record<string, string> = {};
        rows.forEach((r) => {
          map[r.construction_key] = r.body || "";
        });
        setSowTemplatesMap(map);
      } catch {
        setSowTemplatesMap({});
      }
    })();
  }, []);

  const SOW_MODE_KEY =
    estimateName && estimateName.trim() ? `du_sow_mode::${estimateName}` : "";
  const SOW_CUSTOM_KEY =
    estimateName && estimateName.trim() ? `du_sow_custom::${estimateName}` : "";

  const isAdmin = !readOnly;

  const [sowMode, setSowMode] = useState<"auto" | "custom">(() => {
    if (
      readOnly &&
      (sowModeSnapshot === "auto" || sowModeSnapshot === "custom")
    )
      return sowModeSnapshot;
    return "auto";
  });

  const [sowCustomText, setSowCustomText] = useState<string>(() => {
    if (readOnly && sowCustomTextSnapshot != null) {
      return String(sowCustomTextSnapshot || "");
    }
    return "";
  });

  useEffect(() => {
    if (readOnly) return;
    if (!SOW_MODE_KEY) return;
    try {
      const savedMode = (localStorage.getItem(SOW_MODE_KEY) || "auto") as
        | "auto"
        | "custom";
      setSowMode(savedMode === "custom" ? "custom" : "auto");
    } catch {}
  }, [SOW_MODE_KEY, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    if (!SOW_CUSTOM_KEY) return;
    try {
      const saved = localStorage.getItem(SOW_CUSTOM_KEY) || "";
      setSowCustomText(saved);
    } catch {}
  }, [SOW_CUSTOM_KEY, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    if (!SOW_MODE_KEY) return;
    try {
      localStorage.setItem(SOW_MODE_KEY, sowMode);
    } catch {}
  }, [SOW_MODE_KEY, sowMode, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    if (!SOW_CUSTOM_KEY) return;
    try {
      localStorage.setItem(SOW_CUSTOM_KEY, sowCustomText || "");
    } catch {}
  }, [SOW_CUSTOM_KEY, sowCustomText, readOnly]);

  const autoScopeText = useMemo(() => {
    const txt = sowKey ? sowTemplatesMap?.[sowKey] : "";
    return (txt || "").toString();
  }, [sowKey, sowTemplatesMap]);

  const finalScopeText = sowMode === "custom" ? sowCustomText : autoScopeText;

  // Rows
  const rows = useMemo(() => {
    const baseRows: Array<{
      key: string;
      label: string;
      typeText?: string;
      qtyText: string;
      description: string;
      baseCost: number;
      isFixedPrice?: boolean;
    }> = [
      {
        key: "decking",
        label: "Decking",
        typeText: deckingType || "",
        qtyText: fmtQty(
          deckingQty,
          deckingUnit || "sf",
          deckingType,
          "Decking"
        ),
        description:
          (deckingDescription || "").trim() ||
          "Composite decking installed to match selected finish and layout.",
        baseCost: deckingSubtotal || 0,
      },
      {
        key: "railing",
        label: "Railing",
        typeText: railingType || "",
        qtyText: fmtQty(railingQty, railingUnit || "lf"),
        description:
          (railingDescription || "").trim() ||
          "Railing system installed per code with a durable finish.",
        baseCost: railingSubtotal || 0,
      },
      {
        key: "stairs",
        label: "Stairs",
        typeText: stairsType || "",
        qtyText: fmtQty(stairsQty, stairsUnit || "ea"),
        description:
          (stairsDescription || "").trim() ||
          "Stair system built for safe access with consistent rise/run.",
        baseCost: stairsSubtotal || 0,
      },
      {
        key: "fasteners",
        label: "Fasteners",
        typeText: fastenerType || "",
        qtyText: fmtQty(fastenerQty, fastenerUnit || "ea"),
        description:
          (fastenerDescription || "").trim() ||
          "Fasteners and hardware required for proper installation.",
        baseCost: fastenerSubtotal || 0,
      },
      {
        key: "demo",
        label: "Demolition",
        typeText: demoType || "",
        qtyText: fmtQty(demoQty, demoUnit || "ea"),
        description:
          (demoDescription || "").trim() ||
          "Removal and disposal of existing materials as required.",
        baseCost: demoSubtotal || 0,
      },
      {
        key: "skirting",
        label: "Skirting / Lattice",
        typeText: skirtingType || "",
        qtyText: fmtQty(skirtingQty, skirtingUnit || "sf"),
        description:
          (skirtingDescription || "").trim() ||
          "Finished skirting/lattice to close off underside cleanly.",
        baseCost: skirtingSubtotal || 0,
      },
    ];

    const addOns =
      (addItemsDetailed || [])
        .filter((r) => {
          const base = Number(r?.lineBase || 0);
          const hasPicked = !!r?.picked?.name;
          const hasCustomName = !!(r as any)?.customName?.toString().trim();
          const hasCustomDesc = !!(r as any)?.customDescription
            ?.toString()
            .trim();
          return base !== 0 && (hasPicked || hasCustomName || hasCustomDesc);
        })
        .map((r) => {
          const customName = (r as any)?.customName?.toString().trim() || "";
          const customDesc =
            (r as any)?.customDescription?.toString().trim() || "";
          const isMisc = (r.category || "").toLowerCase().trim() === "misc";

          const typeText =
            customName || r.picked?.name || (isMisc ? "Misc Item" : "");

          const description =
            customDesc ||
            (r.picked as any)?.proposal_description?.toString().trim() ||
            (isMisc
              ? ""
              : "Additional feature included as selected in the project scope.");

          return {
            key: `add-${r.rowId}`,
            label: (r.category || "Additional Item").toString(),
            typeText,
           qtyText: isMisc
  ? ((r as any)?.customQtyText?.toString().trim() || "—")
  : fmtQty(
      r.qty,
      r.unit,
      customName || r.picked?.name || "",
      r.category || ""
    ),

            description,
            baseCost: Number(r.lineBase || 0),
            isFixedPrice: (r as any).isFixedPrice ?? isMisc,
          };
        }) || [];

    return [...baseRows, ...addOns].filter((r) => (r.baseCost || 0) !== 0);
  }, [
    addItemsDetailed,
    deckingSubtotal,
    railingSubtotal,
    stairsSubtotal,
    fastenerSubtotal,
    demoSubtotal,
    skirtingSubtotal,
    deckingQty,
    deckingUnit,
    railingQty,
    railingUnit,
    stairsQty,
    stairsUnit,
    fastenerQty,
    fastenerUnit,
    demoQty,
    demoUnit,
    skirtingQty,
    skirtingUnit,
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
  ]);



   const enabledSections = useMemo(() => {
  const raw = (readOnly ? proposalSectionsSnapshot : dbProposalSections) as
    | ProposalSection[]
    | null
    | undefined;

  return Array.isArray(raw) ? raw.filter((s) => s?.enabled) : [];
}, [readOnly, proposalSectionsSnapshot, dbProposalSections]);



  // ✅ Order from SettingsPage
const layoutOrder = useMemo<string[]>(() => {
  const arr = (liveUserSettings as any)?.proposalLayoutOrder;
  return Array.isArray(arr)
    ? arr
        .map(normalizeLayoutId)
        .map((x) => String(x).trim())
        .filter(Boolean)
    : [];
}, [liveUserSettings]);

const effectiveOrder = useMemo<string[]>(() => {
  const enabledCustomIds = enabledSections.map((s) => String(s.id).trim());

  // saved order from Settings
  const raw = (layoutOrder || []).map((x) => String(x).trim()).filter(Boolean);

  // keep only enabled custom ids + system ids
  const filtered = raw.filter(
    (id) =>
      id === "__details__" ||
      id === "__timeline__" ||
      enabledCustomIds.includes(id)
  );

  // append any enabled custom sections missing from saved order (DB order)
  const missingCustom = enabledCustomIds.filter((id) => !filtered.includes(id));
  let out = [...filtered, ...missingCustom];

  // ensure system blocks exist exactly once
  if (!out.includes("__details__")) out.push("__details__");
  if (!out.includes("__timeline__")) out.push("__timeline__");

  // de-dupe preserving first occurrence
  out = out.filter((v, i) => out.indexOf(v) === i);

  return out;
}, [layoutOrder, enabledSections]);

  useEffect(() => {
    console.log("✅ ProposalPage order check", {
      proposalLayoutOrder: (userSettings as any)?.proposalLayoutOrder,
      layoutOrder,
      enabledIds: enabledSections.map((s) => s.id),
      enabledTitles: enabledSections.map((s) => s.title),
      effectiveOrder,
    });
  }, [userSettings, layoutOrder, enabledSections, effectiveOrder]);

  // Header blocks
  const PreparedBlock = (
    <div className="proposal-headBlock proposal-prepared">
      <div className="proposal-headTitle">Prepared by:</div>
      <div className="proposal-headLine">
        <strong>Name:</strong> {userSettings?.userName || "________________"}
      </div>
      <div className="proposal-headLine">
        <strong>Phone:</strong> {userSettings?.userPhone || "________________"}
      </div>
      <div className="proposal-headLine">
  <strong>Email:</strong>{" "}
  <span className="proposal-headValue">
    {userSettings?.userEmail || "________________"}
  </span>
</div>

    </div>
  );

  const LogoBlock = (
    <div
      className="proposal-headBlock proposal-logoBlock"
      aria-label="Company logo"
    >
      {userSettings?.logoDataUrl ? (
        <img
          src={userSettings.logoDataUrl}
          alt="Company Logo"
          className="proposal-logoImg"
        />
      ) : (
        <div className="proposal-logoFallback">LOGO</div>
      )}

      {userSettings?.logoSlogan?.trim() ? (
        <div className="proposal-logoSlogan">
          {userSettings.logoSlogan.trim()}
        </div>
      ) : null}
    </div>
  );

  const ClientBlock = (
    <div className="proposal-headBlock proposal-clientInfo">
      <div className="proposal-headTitle">Client Info:</div>

      <div className="proposal-headLine">
        <strong>Name:</strong>{" "}
        {(clientTitle ? clientTitle + " " : "") + (clientLastName || "—")}
      </div>

      <div className="proposal-headLine">
        <strong>Location:</strong> {clientTown || "—"}
      </div>

      <div className="proposal-headLine">
        <strong>Email:</strong> {clientEmail || "—"}
      </div>

      <div className="proposal-headLine">
        <strong>Date:</strong>{" "}
        {new Date().toLocaleDateString([], {
          month: "short",
          day: "2-digit",
          year: "numeric",
        })}
      </div>
    </div>
  );

  const renderDetailsBlock = () => {
    return (
      <>
        <h2 className="proposal-secTitle">Details</h2>

        <table className="proposal-table">
          <thead>
            <tr>
              <th style={{ width: "34%" }}>Item</th>
              <th style={{ width: "14%" }}>QTY</th>
              <th>Description</th>
              {showLineItemPrices && (
                <th style={{ width: "18%", textAlign: "right" }}>Cost</th>
              )}
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const qtyDisplay = r.qtyText || "—";


              return (
                <tr key={r.key}>
                  <td>
                    <div style={{ fontWeight: 700 }}>
                      {r.typeText || r.label}
                    </div>
                    {r.label && r.label.toLowerCase() !== "misc" ? (
                      <div className="proposal-muted" style={{ marginTop: 2 }}>
                        {r.label}
                      </div>
                    ) : null}
                  </td>

                  <td className="proposal-muted">{qtyDisplay}</td>
                  <td className="proposal-muted">{r.description}</td>

                  {showLineItemPrices && (
                    <td style={{ textAlign: "right" }}>
                      ${money0(lineTotal(r.baseCost, (r as any).isFixedPrice))}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="proposal-totalRow">
          <div className="proposal-totalLabel">Total Investment</div>
          <div className="proposal-totalNumber">
            ${money0(finalEstimate || 0)}
          </div>
        </div>
      </>
    );
  };

  const renderTimelineBlock = () => {
    return (
      <>
        <h2 className="proposal-secTitle">Timeline</h2>

        {!readOnly && (
          <div className="proposal-timeline no-print">
            <div className="proposal-timeline-field">
              <span className="proposal-text">Est. Start Date:</span>
              <select
                className="proposal-timeline-select"
                value={startWeeks}
                onChange={(e) => setStartWeeks(Number(e.target.value))}
              >
                <option value={1}>1 week</option>
                <option value={2}>2 weeks</option>
                <option value={3}>3 weeks</option>
                <option value={4}>4 weeks</option>
                <option value={6}>5–6 weeks</option>
                <option value={8}>7–8 weeks</option>
              </select>
            </div>

            <div className="proposal-timeline-field">
              <span className="proposal-text">Est. Project Duration:</span>
              <select
                className="proposal-timeline-select"
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
              >
                <option value={2}>1–2 days</option>
                <option value={5}>3–5 days</option>
                <option value={6}>4–6 days</option>
                <option value={10}>7–10 days</option>
                <option value={14}>10+ days</option>
              </select>
            </div>
          </div>
        )}

        <p
          className={readOnly ? "proposal-text" : "proposal-text only-print"}
          style={{ marginTop: 6 }}
        >
          Estimated start timeframe: {formatStartWeeksRange(startWeeks)}.
          Estimated project duration: {formatDurationRange(durationDays)}.
        </p>
      </>
    );
  };

  return (
    <section className={`proposal-page ${readOnly ? "proposal-page--readonly" : ""}`}>
      {!readOnly && (
        
        <div className="proposal-actions no-print">

  {needsRefresh && (
    <div
      style={{
        marginBottom: 8,
        padding: "8px 12px",
        background: "#fff3f3",
        border: "1px solid #f5c2c2",
        borderRadius: 8,
        color: "#b00020",
        fontWeight: 600,
        fontSize: 13,
      }}
    >
      Changes made to Estimator. Proposal refresh required.
    </div>
  )}

  <button
    type="button"
    className={`btn ${needsRefresh ? "btn-danger" : "btn-secondary"}`}
    onClick={refreshProposal}
    title="Update proposal to latest estimator inputs"
  >
    Refresh Proposal
  </button>

  <button
    type="button"
    className="btn btn-primary"
    onClick={() => window.print()}
  >
            Print / Save PDF
          </button>

          <button
            type="button"
            className={`btn ${
              showLineItemPrices ? "btn-secondary" : "btn-outline"
            }`}
            onClick={() =>
              setShowLineItemPrices((v) => {
                const next = !v;
                try {
                  localStorage.setItem(
                    `du_show_line_prices::${estimateName}`,
                    next ? "1" : "0"
                  );
                } catch {}
                return next;
              })
            }
            title="Toggle line item costs"
          >
            {showLineItemPrices ? "Hide Cost" : "Show Cost"}
          </button>
        </div>
      )}

      {!readOnly && (
        <button
          type="button"
className={`btn ${needsRefresh ? "btn-danger" : "btn-secondary"}`}          onClick={() => {
            console.log("Email button clicked ✅", { onEmailProposal });
            onEmailProposal?.();
          }}
        >
          Email Proposal
        </button>
      )}

      {!readOnly && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 10px",
            border: "1px solid rgba(15, 23, 42, 0.12)",
            borderRadius: 8,
            fontSize: 12,
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <strong style={{ fontWeight: 700 }}>Email tracking</strong>

          {!props.proposalId ? (
            <span style={{ opacity: 0.7 }}>
              Not sent yet (save the estimate and email the proposal to start tracking)
            </span>
          ) : (
            <>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: emailOpenedAt ? "#dcfce7" : "#f1f5f9",
                  color: emailOpenedAt ? "#166534" : "#475569",
                  fontWeight: 700,
                }}
              >
                Opened
              </span>
              <span>
                {emailOpenedAt
                  ? new Date(emailOpenedAt).toLocaleString()
                  : "—"}
                {emailOpenedCount ? ` (${emailOpenedCount})` : ""}
              </span>

              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: emailClickedAt ? "#dcfce7" : "#f1f5f9",
                  color: emailClickedAt ? "#166534" : "#475569",
                  fontWeight: 700,
                }}
              >
                Clicked
              </span>
              <span>
                {emailClickedAt
                  ? new Date(emailClickedAt).toLocaleString()
                  : "—"}
                {emailClickedCount ? ` (${emailClickedCount})` : ""}
              </span>
            </>
          )}

          <button
            type="button"
            className="btn btn-outline"
            onClick={loadEmailTracking}
            disabled={emailTrackingLoading || !props.proposalId}
            style={{ padding: "6px 10px", fontSize: 12 }}
          >
            {emailTrackingLoading ? "Refreshing..." : "Refresh status"}
          </button>
          {emailLastCheckedAt && (
            <span style={{ opacity: 0.6 }}>
              Last checked: {emailLastCheckedAt.toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      <article ref={docRef as any} className="proposal-doc" id="proposal-doc">
        <div className="proposal-page-number only-print" aria-hidden="true" />
        <div className="du-print-page">
          {userSettings?.logoDataUrl ? (
            <img
              className="du-print-watermark"
              src={userSettings.logoDataUrl}
              alt=""
              aria-hidden="true"
            />
          ) : null}

          <header className="proposal-head">
            <div className="proposal-headSlot proposal-headSlot-left">
              {PreparedBlock}
            </div>
            <div className="proposal-headSlot proposal-headSlot-center">
              {LogoBlock}
            </div>
            <div className="proposal-headSlot proposal-headSlot-right">
              {ClientBlock}
            </div>
          </header>

          <h1 className="proposal-title">Project Estimate</h1>
{!readOnly && (
  <div
    className="no-print"
    style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}
  >
    Last refreshed:{" "}
    {lastRefreshedAt.toLocaleString([], {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}
  </div>
)}

<section className="proposal-scope">
  <div
    className="proposal-clientBarTitle"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    }}
  >
    <span>Scope of Work</span>

    {isAdmin ? (
      <div className="no-print" style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className={`btn ${sowMode === "auto" ? "btn-secondary" : "btn-outline"}`}
          onClick={() => setSowMode("auto")}
        >
          Auto
        </button>
        <button
          type="button"
          className={`btn ${sowMode === "custom" ? "btn-secondary" : "btn-outline"}`}
          onClick={() => setSowMode("custom")}
        >
          Custom
        </button>
      </div>
    ) : null}
  </div>

  {!readOnly && sowMode === "custom" ? (
    <div className="no-print">
      <textarea
        className="proposal-notes-input"
        placeholder="Admin: type a custom Scope of Work..."
        value={sowCustomText}
        onChange={(e) => setSowCustomText(e.target.value)}
        rows={7}
        readOnly={!isAdmin}
        spellCheck={true}
        autoCorrect="on"
        autoCapitalize="sentences"
      />
    </div>
  ) : null}

  <p className="proposal-text" style={{ whiteSpace: "pre-wrap" }}>
    {finalScopeText?.trim()
      ? finalScopeText
      : "This project includes the construction of a custom outdoor deck designed to match the selected materials, layout, and site conditions. Final scope and details are based on the selections made during the estimate and are subject to on-site verification."}
  </p>
</section>

{/* ✅ Render in SettingsPage order */}
{effectiveOrder.map((idRaw) => {
  const id = normalizeLayoutId(idRaw);

  if (id === "__details__") {
    return <React.Fragment key={id}>{renderDetailsBlock()}</React.Fragment>;
  }
  if (id === "__timeline__") {
    return <React.Fragment key={id}>{renderTimelineBlock()}</React.Fragment>;
  }

  const sec = enabledSections.find(
    (s) => String(s.id).trim() === String(id).trim()
  );

  if (!sec) return null;

  return (
    <section key={sec.id}>
      <h2 className="proposal-secTitle">{sec.title}</h2>

      {sec.type === "bullets" ? (
        <ul className="proposal-bullets">
          {bulletLines(sec.text).map((line, idx) => (
            <li key={`${sec.id}_${idx}`}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="proposal-text" style={{ whiteSpace: "pre-wrap" }}>
          {sec.text || ""}
        </p>
      )}
    </section>
  );
})}

<h2 className="proposal-secTitle">Notes</h2>

{!readOnly && (
  <div className="no-print">
    <textarea
      className="proposal-notes-input"
      placeholder="Notes (optional)…"
      value={proposalNotes}
      onChange={(e) => setProposalNotes(e.target.value)}
      rows={5}
      spellCheck={true}
      autoCorrect="on"
      autoCapitalize="sentences"
    />
  </div>
)}

{proposalNotes?.trim() ? (
  <p className="proposal-text proposal-notes-print" style={{ whiteSpace: "pre-wrap" }}>
    {proposalNotes}
  </p>
) : null}
   </div>
      </article>
    </section>
  );
}