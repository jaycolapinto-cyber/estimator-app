// ProposalPage.tsx
// ✅ Header matches example: Prepared (left) | Logo (center) | Meta (right)
// ✅ No overlay, no reordering, no broken blocks
// ✅ Print uses hidden iframe and preserves layout

import React, { useEffect, useMemo, useRef, useState } from "react";
import "./ProposalPage.css";
import type { UserSettings, ProposalSection } from "./SettingsPage";
import { fetchSowTemplatesRows } from "./sowTemplates";
type AddItemRow = {
  rowId: string;
  qty?: number | null;
  unit?: string | null;
  lineBase?: number | null;

  picked?: { name: string; proposal_description?: string | null } | null;

  customName?: string | null;
  customDescription?: string | null;

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

type ProposalPageProps = {
  userSettings: UserSettings | null;
  estimateName: string;
  finalEstimate: number;

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

  defaultShowLineItemPrices?: boolean;
  onEmailProposal?: () => void;
  readOnly?: boolean; // ✅ customer view
  // ✅ Snapshot fields (Review page must match what was sent)
  proposalNotesSnapshot?: string | null;
  sowModeSnapshot?: "auto" | "custom" | null;
  sowCustomTextSnapshot?: string | null;
  startWeeksSnapshot?: number | null;
  durationDaysSnapshot?: number | null;
  showLineItemPricesSnapshot?: boolean | null;
};

function money0(n: number) {
  return Math.round(n || 0).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

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

  // ✅ Proposal display override (keep pricing logic elsewhere)
  if (u0 === "multiplier") {
    const n = (name || "").toLowerCase();
    const c = (category || "").toLowerCase();

    // if the item name includes "sf/lf/ea", trust it
    if (n.includes(" sf")) return `${qStr} SF`;
    if (n.includes(" lf")) return `${qStr} LF`;
    if (n.includes(" ea")) return `${qStr} EA`;

    // category-based fallback
    if (c.includes("deck") || c.includes("skirting") || c.includes("lattice"))
      return `${qStr} SF`;
    if (c.includes("rail")) return `${qStr} LF`;

    // otherwise show just the number (better than saying "multiplier")
    return qStr;
  }

  // normal units
  return `${qStr} ${u0}`;
}

function bulletLines(text?: string | null) {
  return (text || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Grabs CSS from the current page (best effort; ignores cross-origin rules)
function collectAllCssText(): string {
  const out: string[] = [];

  document.querySelectorAll("style").forEach((s) => {
    out.push(s.textContent || "");
  });

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = (sheet as CSSStyleSheet).cssRules;
      if (!rules) continue;
      out.push(
        Array.from(rules)
          .map((r) => r.cssText)
          .join("\n")
      );
    } catch {
      // cross-origin stylesheet - ignore
    }
  }

  return out.join("\n");
}

export default function ProposalPage(props: ProposalPageProps) {
  const {
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

    // ✅ snapshot props (Review page)
    proposalNotesSnapshot,
    sowModeSnapshot,
    sowCustomTextSnapshot,
    startWeeksSnapshot,
    durationDaysSnapshot,
    showLineItemPricesSnapshot,
  } = props;

  const docRef = useRef<HTMLElement | null>(null);

  const [showLineItemPrices, setShowLineItemPrices] = useState<boolean>(() => {
    if (readOnly && typeof showLineItemPricesSnapshot === "boolean") {
      return showLineItemPricesSnapshot;
    }
    return !!defaultShowLineItemPrices;
  });

  // Timeline (saved per estimate)
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

  // Notes (saved per estimate)
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
    if (readOnly) return; // ✅ review page uses snapshot only
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
    if (readOnly) return; // ✅ don't write localStorage on review page
    if (!NOTES_KEY) return;
    try {
      localStorage.setItem(NOTES_KEY, proposalNotes || "");
    } catch {}
  }, [NOTES_KEY, proposalNotes, readOnly]);

  // Apply uplift only when not fixed price
  const lineTotal = (baseCost: number, isFixedPrice?: boolean) =>
    (baseCost || 0) * (isFixedPrice ? 1 : upliftMultiplier || 1);

  // Scope of work
  const sowKey = useMemo(() => toSowKey(constructionType), [constructionType]);
  // Shared SOW templates (Supabase) with local cache fallback
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

  // ------------------------------
  // SOW MODE (AUTO vs CUSTOM)
  // Saved per estimate in localStorage
  // ------------------------------
  const SOW_MODE_KEY =
    estimateName && estimateName.trim() ? `du_sow_mode::${estimateName}` : "";

  const SOW_CUSTOM_KEY =
    estimateName && estimateName.trim() ? `du_sow_custom::${estimateName}` : "";

  // ✅ TEMP admin flag (replace later with real admin logic)
  // For now: anyone can edit if you set true
  const isAdmin = !readOnly; // ✅ only admin when NOT in customer view
  const [sowMode, setSowMode] = useState<"auto" | "custom">(() => {
    if (
      readOnly &&
      (sowModeSnapshot === "auto" || sowModeSnapshot === "custom")
    ) {
      return sowModeSnapshot;
    }
    return "auto";
  });

  const [sowCustomText, setSowCustomText] = useState<string>(() => {
    if (readOnly && sowCustomTextSnapshot != null) {
      return String(sowCustomTextSnapshot || "");
    }
    return "";
  });

  // load saved SOW mode + custom text
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

  // persist
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
            qtyText: fmtQty(
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
    const raw = (userSettings?.proposalSections || []) as ProposalSection[];
    return Array.isArray(raw) ? raw.filter((s) => s?.enabled) : [];
  }, [userSettings?.proposalSections]);

  // ✅ PRINT (hidden iframe)
  const printProposal = () => {
    const node = docRef.current;
    if (!node) return;

    const cssText = collectAllCssText();

    const printStyle = `
    <style>
      @page { size: letter; margin: 0.5in; }
      html, body { background: #fff !important; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  
      /* Keep proposal full width and use @page margins */
      .proposal-page { padding: 0 !important; background: #fff !important; }
      .proposal-doc {
        max-width: none !important;
        width: 100% !important;
        margin: 0 !important;
        box-shadow: none !important;
        border: 0 !important;
        padding: 34px 40px !important;
      }
  
      .proposal-actions, .no-print { display: none !important; }
      .only-print { display: block !important; }
  
      /* ✅ PRINT: make logo large */
      .proposal-logoImg {
        max-height: 160px !important;
        max-width: 420px !important;
        width: auto !important;
        height: auto !important;
      }
    </style>
  `;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    const win = iframe.contentWindow;

    if (!doc || !win) {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      return;
    }

    doc.open();
    doc.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>${cssText}</style>
    ${printStyle}
    <title>Proposal</title>
  </head>
  <body>
    ${node.outerHTML}
  </body>
</html>`);
    doc.close();

    const cleanup = () => {
      try {
        win.onafterprint = null;
      } catch {}
      if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };

    let cleaned = false;
    const safeCleanup = () => {
      if (cleaned) return;
      cleaned = true;
      cleanup();
    };

    // ✅ cleanup AFTER print closes (best), plus a longer fallback
    try {
      win.onafterprint = () => {
        setTimeout(safeCleanup, 250);
      };
    } catch {}

    // Fallback cleanup (if afterprint doesn’t fire)
    setTimeout(safeCleanup, 10000);

    const doPrint = () => {
      try {
        win.focus();
        // tiny delay helps Chrome register focus before printing
        setTimeout(() => {
          try {
            win.print();
          } catch (err: any) {
            const msg = String(err?.message || err || "");
            // ✅ ignore the known Chrome dev/iframe timing error
            if (msg.includes("callback is no longer runnable")) {
              safeCleanup();
              return;
            }
            throw err;
          }
        }, 50);
      } catch {
        safeCleanup();
      }
    };

    // Wait for images (logo)
    const imgs = Array.from(doc.images || []);
    if (imgs.length === 0) {
      setTimeout(doPrint, 200);
      return;
    }

    let loaded = 0;
    const done = () => {
      loaded++;
      if (loaded >= imgs.length) setTimeout(doPrint, 200);
    };

    imgs.forEach((img) => {
      if ((img as any).complete) return done();
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    });

    setTimeout(doPrint, 1500);
  };

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
        <strong>Email:</strong> {userSettings?.userEmail || "________________"}
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
    </div>
  );

  const MetaBlock = (
    <div className="proposal-headBlock proposal-meta">
      <div className="proposal-metaRow">
        <span>Date</span>
        <strong>{new Date().toLocaleDateString()}</strong>
      </div>
      <div className="proposal-metaRow">
        <span>Estimate</span>
        <strong>{estimateName || "—"}</strong>
      </div>
      <div className="proposal-metaRow proposal-metaTotal">
        <span>Total Investment</span>
        <strong>${money0(finalEstimate || 0)}</strong>
      </div>
    </div>
  );

  return (
    <section className="proposal-page">
      {!readOnly && (
        <div className="proposal-actions no-print">
          <button
            type="button"
            className="btn btn-primary"
            onClick={printProposal}
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
          className="btn btn-secondary"
          onClick={() => {
            console.log("Email button clicked ✅", { onEmailProposal });
            onEmailProposal?.();
          }}
        >
          Email Proposal
        </button>
      )}

      <article ref={docRef as any} className="proposal-doc" id="proposal-doc">
        {/* ✅ EXACT HEADER LIKE YOUR EXAMPLE */}
        <header className="proposal-head">
          <div className="proposal-headSlot proposal-headSlot-left">
            {PreparedBlock}
          </div>
          <div className="proposal-headSlot proposal-headSlot-center">
            {LogoBlock}
          </div>
          <div className="proposal-headSlot proposal-headSlot-right">
            {MetaBlock}
          </div>
        </header>

        <section className="proposal-clientBar">
          <div className="proposal-clientBarTitle">Client Information</div>

          <div className="proposal-clientBarRow">
            <div className="proposal-clientCell">
              <div className="proposal-clientLabel">Client</div>
              <div className="proposal-clientValue">
                {(clientTitle ? clientTitle + " " : "") +
                  (clientLastName || "—")}
              </div>
            </div>

            <div className="proposal-clientCell">
              <div className="proposal-clientLabel">Location</div>
              <div className="proposal-clientValue">{clientTown || "—"}</div>
            </div>

            <div className="proposal-clientCell">
              <div className="proposal-clientLabel">Email</div>
              <div className="proposal-clientValue">{clientEmail || "—"}</div>
            </div>
          </div>
        </section>

        <h1 className="proposal-title">Project Estimate</h1>

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

            {/* ✅ Admin-only toggle */}
            {isAdmin ? (
              <div className="no-print" style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className={`btn ${
                    sowMode === "auto" ? "btn-secondary" : "btn-outline"
                  }`}
                  onClick={() => setSowMode("auto")}
                >
                  Auto
                </button>
                <button
                  type="button"
                  className={`btn ${
                    sowMode === "custom" ? "btn-secondary" : "btn-outline"
                  }`}
                  onClick={() => setSowMode("custom")}
                >
                  Custom
                </button>
              </div>
            ) : null}
          </div>

          {/* ✅ CUSTOM MODE (Admin can type; Users read-only) */}
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

          {/* ✅ SHOW TEXT (Auto or Custom) */}
          <p className="proposal-text" style={{ whiteSpace: "pre-wrap" }}>
            {finalScopeText?.trim()
              ? finalScopeText
              : "This project includes the construction of a custom outdoor deck designed to match the selected materials, layout, and site conditions. Final scope and details are based on the selections made during the estimate and are subject to on-site verification."}
          </p>
        </section>

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
              const isMiscRow = (r.label || "").toLowerCase().trim() === "misc";
              const qtyDisplay =
                isMiscRow && !showLineItemPrices
                  ? `${money0(r.baseCost)}`
                  : r.qtyText || "—";

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
                {Array.from({ length: 10 }, (_, i) => i + 1).map((w) => (
                  <option key={w} value={w}>
                    {w} week{w === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </div>

            <div className="proposal-timeline-field">
              <span className="proposal-text">Est. Project Duration:</span>
              <select
                className="proposal-timeline-select"
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
              >
                {Array.from({ length: 25 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d} day{d === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {readOnly ? (
          <ul className="proposal-bullets" style={{ marginTop: 6 }}>
            <li>
              Estimated start time approx. {startWeeks} week
              {startWeeks === 1 ? "" : "s"} with a {durationDays}-day estimated
              project duration.
            </li>
          </ul>
        ) : (
          <ul className="proposal-bullets only-print" style={{ marginTop: 6 }}>
            <li>
              Estimated start time approx. {startWeeks} week
              {startWeeks === 1 ? "" : "s"} with a {durationDays}-day estimated
              project duration.
            </li>
          </ul>
        )}

        {enabledSections.map((sec) => (
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
        ))}
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

        {/* ✅ Show notes as normal text for customers + print */}
        {proposalNotes?.trim() ? (
          <p
            className="proposal-text proposal-notes-print"
            style={{ whiteSpace: "pre-wrap" }}
          >
            {proposalNotes}
          </p>
        ) : null}
      </article>
    </section>
  );
}
