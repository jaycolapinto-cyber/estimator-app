// src/ContractPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./ContractPage.css";
import {
  ST124FormData,
  downloadBlob,
  generateST124Pdf,
} from "./st124Pdf";

export type ContractData = {
  // Client / header
  hdrClient: string;
  hdrAddress: string;
  hdrCity: string;
  hdrState: string;
  hdrZip: string;
  hdrPhone: string;
  hdrEmail: string;
  hdrDate: string;
  hdrPageNum: string;
  hdrPageOf: string;
  // Tracks which header fields the user manually edited
  // so estimate-driven auto-fill doesn't clobber them.
  hdrTouched: {
    client?: boolean;
    address?: boolean;
    city?: boolean;
    state?: boolean;
    zip?: boolean;
    phone?: boolean;
    email?: boolean;
  };
  // Schedule
  hdrApproxStart: string;
  hdrApproxEnd: string;
  hdrEssence: "yes" | "not" | "";
  // Scope
  specificationText: string;
  specificationTouched: boolean;
  // Contract sum
  contractSumWords: string;
  contractSumNumerals: string;
  // Payment
  paymentScheduleText: string;
  paymentMode: "basic" | "staged";
  paymentPercents: {
    deposit: number;
    dayOne: number;
    afterDecking: number;
    holdback: number;
  };
  paymentLabels: {
    deposit: string;
    dayOne: string;
    afterDecking: string;
    holdback: string;
    balance: string;
  };
  // Legal
  legalDisclaimerText: string;
  // Display
  forcePageBreak: boolean;
  // ST-124 (Capital Improvement)
  st124ProjectDescription: string;
  st124ProjectDescriptionTouched: boolean;
};

type Props = {
  estimateId: string;
  orgId: string | null;
  contract: ContractData | null;
  onContractChange: (next: ContractData) => void;
  finalEstimate: number;
  selectedDecking: any;
  selectedRailing: any;
  selectedStairOption: any;
  selectedFastener: any;
  selectedConstruction: any;
  selectedSkirting?: any;
  constructionKey?: string;
  constructionType?: string;
  clientTitle?: string;
  clientLastName?: string;
  clientLocation?: string;
  clientEmail?: string;
  demoType?: string | null;
  demoDescription?: string | null;
  addItemsDetailed?: any;
};

const DEFAULT_LEGAL =
  "All material is guaranteed to be specified. All work to be completed in a work-manlike manner according to standard practices.\n\nThe buyer is responsible for all permits and C.O.'s unless otherwise specified. Decks Unique Inc. is not responsible for weathering, shrinkage or growth on materials, or any underground utilities that may be damaged.\n\nAll agreements contingent upon strikes, accidents or delays beyond our control. There will be a labor charge for any warrantee claim.\n\nIn the event of any litigation to enforce the terms of this contract the unsuccessful party will reimburse the other party for all costs, including reasonable attorney fees.";

const DEFAULT_PAYMENT_TEXT = "$1,000 deposit with contract. Balance upon completion.";

export const defaultContract = (): ContractData => ({
  hdrClient: "",
  hdrAddress: "",
  hdrCity: "",
  hdrState: "",
  hdrZip: "",
  hdrPhone: "",
  hdrEmail: "",
  hdrDate: new Date().toLocaleDateString(),
  hdrPageNum: "1",
  hdrPageOf: "1",
  hdrTouched: {},
  hdrApproxStart: "",
  hdrApproxEnd: "",
  hdrEssence: "not",
  specificationText: "",
  specificationTouched: false,
  contractSumWords: "",
  contractSumNumerals: "",
  paymentScheduleText: DEFAULT_PAYMENT_TEXT,
  paymentMode: "basic",
  paymentPercents: { deposit: 10, dayOne: 30, afterDecking: 30, holdback: 0 },
  paymentLabels: {
    deposit: "Deposit",
    dayOne: "Day one",
    afterDecking: "After decking completed",
    holdback: "Holdback after final inspection",
    balance: "Balance upon completion",
  },
  legalDisclaimerText: DEFAULT_LEGAL,
  forcePageBreak: false,
  st124ProjectDescription: "",
  st124ProjectDescriptionTouched: false,
});

// Format a stored date string as "May 17, 2026". Falls back to the raw
// input if it can't be parsed (so manually-typed text isn't clobbered).
const formatLongDate = (raw: string): string => {
  const s = (raw || "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const numberToWords = (num: number): string => {
  if (!Number.isFinite(num) || num <= 0) return "";
  const belowTwenty = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
    "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
    "Sixteen", "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const thousandPowers = ["", "Thousand", "Million", "Billion"];

  const chunkToWords = (n: number) => {
    let out = "";
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    if (hundred) out += `${belowTwenty[hundred]} Hundred`;
    if (rest) {
      if (out) out += " ";
      if (rest < 20) out += belowTwenty[rest];
      else {
        const t = Math.floor(rest / 10);
        const u = rest % 10;
        out += tens[t];
        if (u) out += ` ${belowTwenty[u]}`;
      }
    }
    return out;
  };

  let n = Math.floor(num);
  let power = 0;
  const words: string[] = [];
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk) {
      const chunkWords = chunkToWords(chunk);
      const label = thousandPowers[power];
      words.unshift(label ? `${chunkWords} ${label}` : chunkWords);
    }
    n = Math.floor(n / 1000);
    power += 1;
  }
  return words.join(" ").trim();
};

export default function ContractPage(props: Props) {
  // Fully controlled: derive contract from prop, fall back to defaults.
  const c: ContractData = useMemo(
    () => props.contract ?? defaultContract(),
    [props.contract]
  );

  const update = (patch: Partial<ContractData>) => {
    props.onContractChange({ ...c, ...patch });
  };

  const [mode, setMode] = useState<"edit" | "preview" | "st124">("edit");
  const [st124Generating, setSt124Generating] = useState(false);
  const [st124Error, setSt124Error] = useState<string | null>(null);

  // ============================================================
  // Branding (from user settings localStorage)
  // ============================================================
  const storedUserSettings = useMemo(() => {
    const tryRead = (key: string) => {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    };
    return (
      tryRead("userSettings") ||
      tryRead("du_user_settings") ||
      tryRead("duUserSettings") ||
      null
    );
  }, []);

  const companyName = useMemo(
    () =>
      (
        storedUserSettings?.organizationName ||
        storedUserSettings?.orgName ||
        storedUserSettings?.companyName ||
        ""
      ).trim() || "Decks Unique",
    [storedUserSettings]
  );

  const companyLogo = useMemo(
    () => String(storedUserSettings?.logoDataUrl || "").trim(),
    [storedUserSettings]
  );

  const companyTagline = useMemo(
    () =>
      String(
        storedUserSettings?.logoSlogan ||
          "Pride and Quality Make Decks Unique"
      ).trim(),
    [storedUserSettings]
  );

  // ============================================================
  // Auto-fill: client name + city from estimate
  // ============================================================
  const autoClientName = useMemo(() => {
    return [props.clientTitle, props.clientLastName]
      .map((p) => (p || "").trim())
      .filter(Boolean)
      .join(" ");
  }, [props.clientTitle, props.clientLastName]);

  useEffect(() => {
    if (autoClientName && !c.hdrTouched.client && autoClientName !== c.hdrClient) {
      update({ hdrClient: autoClientName });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoClientName, c.hdrTouched.client]);

  useEffect(() => {
    const loc = (props.clientLocation || "").trim();
    if (loc && !c.hdrTouched.city && loc !== c.hdrCity) {
      update({ hdrCity: loc });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.clientLocation, c.hdrTouched.city]);

  useEffect(() => {
    const e = (props.clientEmail || "").trim();
    if (e && !c.hdrTouched.email && e !== c.hdrEmail) {
      update({ hdrEmail: e });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.clientEmail, c.hdrTouched.email]);

  // ============================================================
  // Auto-generate scope of work from estimate selections
  // ============================================================
  const addOnLabels = useMemo(() => {
    const items = (props.addItemsDetailed || [])
      .map((row: any) => {
        const pickedDesc = row?.picked?.proposal_description || "";
        const picked = row?.picked?.name || row?.picked?.label || "";
        const customName = row?.customName || "";
        const customDesc = row?.customDescription || "";
        const qty = Number(row?.qty ?? row?.quantity ?? row?.lineQty ?? 0);
        const lineBase = Number(row?.lineBase || 0);
        const customPrice = Number(row?.customPrice || 0);

        const label = (pickedDesc || customDesc || customName || picked || "").toString().trim();
        if (!label) return "";
        if (qty <= 0 && lineBase <= 0 && customPrice <= 0) return "";

        const qtyText = qty ? ` (x${qty})` : "";
        return `${label}${qtyText}`;
      })
      .filter((item: string) => item.trim() !== "");
    return Array.from(new Set(items));
  }, [props.addItemsDetailed]);

  const autoSpecification = useMemo(() => {
    const lines: string[] = [];
    const add = (s?: string | null) => {
      const t = (s || "").trim();
      if (t) lines.push(t);
    };

    add("New deck to be built as per the sketch plans and 3D renderings that will be emailed prior for approval");

    const demoName = (props.demoType || "").trim();
    const demoBlurb = (props.demoDescription || "").trim();
    if (demoBlurb) add(`Demolition: ${demoBlurb}`);
    else if (demoName)
      add(`Demolition: ${demoName} — Removal and disposal of existing materials as required.`);

    const decking = (props.selectedDecking?.name || props.selectedDecking?.label || "").trim();
    const fastener = (props.selectedFastener?.name || props.selectedFastener?.label || "").trim();
    const railing = (props.selectedRailing?.name || props.selectedRailing?.label || "").trim();
    const skirting = (props.selectedSkirting?.name || props.selectedSkirting?.label || "").trim();
    const stairs = (props.selectedStairOption?.name || props.selectedStairOption?.label || "").trim();

    const construction = (props.constructionType || "").trim().toLowerCase();
    if (construction === "new construction" || construction === "second story") {
      add('Deck Structure: 14"x36" poured concrete footings with KDAT 4x4 support posts and 2x8 floor joists installed 16" on center. All hardware (tecos, bolts, strapping) to be hot-dipped galvanized.');
    } else if (construction === "resurface" || construction === "second story resurface") {
      add("Deck Structure: Existing deck framing to remain. Any compromised framing will be repaired or replaced as needed. All new decking/railing will be installed per code and manufacturer specifications.");
    } else if (construction === "sleeper" || construction === "second story sleeper") {
      add("Deck Structure: Remove existing structure. Sleeper system installed to establish proper pitch and drainage. Decking installed per manufacturer requirements.");
    }

    if (decking) add(`New decking to be installed will be ${decking}, color to be determined.`);
    if (fastener) {
      const f = fastener.toLowerCase();
      const line =
        f.includes("hidden") || f.includes("clip")
          ? "Decking to be secured with Tiger Claw black-coated stainless steel hidden clips."
          : f.includes("nail")
            ? "Decking to be secured with hot-dipped galvanized nails."
            : f.includes("scrail")
              ? "Decking to be secured with stainless steel scrails (gun-driven fasteners combining the holding power of a screw with the speed of a nail)."
              : f.includes("screw")
                ? "Decking to be secured with color-matched stainless steel screws."
                : `Fasteners: ${fastener}.`;
      add(line);
    }
    if (railing) {
      const r = railing.toLowerCase();
      const isTrexSelectFlatTop =
        r.includes("trex") && r.includes("select") && r.includes("flat");
      const detail = isTrexSelectFlatTop ? " with black round aluminum spindles" : "";
      const colorNote = isTrexSelectFlatTop ? "" : ", color to be determined";
      add(`New railing to be installed will be ${railing}${detail}${colorNote}.`);
    }
    if (stairs) {
      const stairBlurb = (props.selectedStairOption?.proposal_description || "").trim();
      add(stairBlurb ? `Stairs: ${stairBlurb}` : `Stairs: ${stairs}.`);
    }
    if (skirting) {
      const s = skirting.toLowerCase();
      add(
        s.includes("lattice")
          ? "Underside of deck to be covered using small diamond vinyl lattice, color TBD, with matching decking picture frame trim."
          : "Underside of deck to be skirted using matching deck boards installed vertically."
      );
    }

    addOnLabels.forEach((item) => add(item as string));
    return Array.from(new Set(lines)).join("\n");
  }, [
    props.demoType,
    props.demoDescription,
    props.selectedDecking,
    props.selectedFastener,
    props.selectedRailing,
    props.selectedStairOption,
    props.selectedSkirting,
    props.constructionType,
    addOnLabels,
  ]);

  // Seed scope text from auto-generated version unless user has edited it.
  useEffect(() => {
    if (!c.specificationTouched && autoSpecification !== c.specificationText) {
      update({ specificationText: autoSpecification });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSpecification, c.specificationTouched]);

  // ============================================================
  // ST-124 project description (auto-derived from selections)
  // ============================================================
  const autoST124Description = useMemo(() => {
    const decking = (props.selectedDecking?.name || "").trim();
    const railing = (props.selectedRailing?.name || "").trim();
    const construction = (props.constructionType || "").trim().toLowerCase();

    const verb =
      construction.includes("resurface") || construction.includes("rebuild")
        ? "Rebuild of"
        : construction.includes("second")
          ? "Second-story addition of"
          : "New construction of";

    let surface = "wood deck";
    if (decking) {
      const lower = decking.toLowerCase();
      const brand = decking.split(/\s+/)[0];
      if (
        lower.includes("ipe") ||
        lower.includes("mahogany") ||
        lower.includes("hardwood")
      ) {
        surface = "hardwood deck";
      } else if (
        lower.includes("trex") ||
        lower.includes("timbertech") ||
        lower.includes("azek") ||
        lower.includes("fiberon") ||
        lower.includes("composite") ||
        lower.includes("pvc")
      ) {
        surface = `${brand} composite deck`;
      } else if (lower.includes("kdat") || lower.includes("pressure")) {
        surface = "pressure-treated wood deck";
      } else {
        surface = `${brand} deck`;
      }
    }

    let railingDesc = "";
    if (railing) {
      const brand = railing.split(/\s+/)[0];
      railingDesc = ` with ${brand} railing system`;
    }

    return `${verb} ${surface}${railingDesc}, permanently affixed to real property.`;
  }, [props.selectedDecking, props.selectedRailing, props.constructionType]);

  useEffect(() => {
    if (
      !c.st124ProjectDescriptionTouched &&
      autoST124Description !== c.st124ProjectDescription
    ) {
      update({ st124ProjectDescription: autoST124Description });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoST124Description, c.st124ProjectDescriptionTouched]);

  // ============================================================
  // Derived values
  // ============================================================
  const specLines = useMemo(
    () =>
      c.specificationText
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l !== ""),
    [c.specificationText]
  );

  const paymentMath = useMemo(() => {
    const total = Number(c.contractSumNumerals.replace(/[^\d]/g, "")) || 0;
    const clamp = (v: number) => Math.max(0, Math.min(100, v));
    const dep = clamp(c.paymentPercents.deposit);
    const d1 = clamp(c.paymentPercents.dayOne);
    const ad = clamp(c.paymentPercents.afterDecking);
    const hb = clamp(c.paymentPercents.holdback);
    const bal = clamp(100 - dep - d1 - ad - hb);
    const r = (v: number) => Math.round(v);
    const depositAmt = r((total * dep) / 100);
    const dayOneAmt = r((total * d1) / 100);
    const afterDeckingAmt = r((total * ad) / 100);
    const holdbackAmt = r((total * hb) / 100);
    const balanceAmt = Math.max(
      total - depositAmt - dayOneAmt - afterDeckingAmt - holdbackAmt,
      0
    );
    const fmt = (v: number) => `$${v.toLocaleString()}`;
    return { total, dep, d1, ad, hb, bal, fmt, depositAmt, dayOneAmt, afterDeckingAmt, holdbackAmt, balanceAmt };
  }, [c.contractSumNumerals, c.paymentPercents]);

  // Flattened sentence version of the staged payment schedule — used for the
  // printed contract so it reads like the old text-style schedule rather than a table.
  const stagedSentence = useMemo(() => {
    const { fmt, dep, d1, ad, hb, depositAmt, dayOneAmt, afterDeckingAmt, holdbackAmt, balanceAmt } = paymentMath;
    const parts = [
      `${dep}% ${c.paymentLabels.deposit.toLowerCase()} (${fmt(depositAmt)})`,
      `${d1}% ${c.paymentLabels.dayOne.toLowerCase()} (${fmt(dayOneAmt)})`,
      `${ad}% ${c.paymentLabels.afterDecking.toLowerCase()} (${fmt(afterDeckingAmt)})`,
      hb ? `${hb}% ${c.paymentLabels.holdback.toLowerCase()} (${fmt(holdbackAmt)})` : "",
      `${c.paymentLabels.balance} (${fmt(balanceAmt)})`,
    ].filter(Boolean);
    return parts.join(", ");
  }, [paymentMath, c.paymentLabels]);

  // ============================================================
  // Actions
  // ============================================================
  const setHdrField = (field: keyof ContractData["hdrTouched"], value: string) => {
    const map: Record<string, keyof ContractData> = {
      client: "hdrClient",
      address: "hdrAddress",
      city: "hdrCity",
      state: "hdrState",
      zip: "hdrZip",
      phone: "hdrPhone",
      email: "hdrEmail",
    };
    update({
      hdrTouched: { ...c.hdrTouched, [field]: true },
      [map[field]]: value,
    } as Partial<ContractData>);
  };

  const handleReset = () => {
    if (
      !window.confirm(
        "Reset contract to defaults? Client info, scope edits, schedule, and payment settings will be cleared."
      )
    )
      return;
    props.onContractChange(defaultContract());
  };

  // Inject contract-only @page rules right before printing, then remove them on
  // afterprint. CSS @page rules can't be scoped to a component via selectors —
  // if we left them in the static stylesheet they'd apply to every print job in
  // the app (e.g. the Proposal page would get the contract's "Decks Unique Inc.
  // — Contract" running header).
  const handleGenerateST124 = async () => {
    setSt124Error(null);
    setSt124Generating(true);
    try {
      const data: ST124FormData = {
        customerName: c.hdrClient || "",
        customerStreet: c.hdrAddress || "",
        customerCity: c.hdrCity || "",
        customerState: c.hdrState || "",
        customerZip: c.hdrZip || "",
        customerCityStateZip: cityStateZip || "",
        customerPhone: c.hdrPhone || "",
        customerEmail: c.hdrEmail || "",
        projectDescription: c.st124ProjectDescription || "",
        projectStreet: c.hdrAddress || "",
        projectCityStateZip: cityStateZip || "",
        date: c.hdrDate || "",
        contractorName: companyName || "Decks Unique Inc.",
        contractorStreet: "119 Commack Road",
        contractorCity: "Commack",
        contractorState: "NY",
        contractorZip: "11725",
        contractorCityStateZip: "Commack, NY 11725",
        contractorPhone: "631.266.3004",
      };

      const blob = await generateST124Pdf(data);
      const safeClient = (c.hdrClient || "Customer")
        .replace(/[^a-z0-9]+/gi, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40);
      downloadBlob(blob, `ST-124_${safeClient || "Customer"}.pdf`);
    } catch (err: any) {
      setSt124Error(err?.message || "Couldn't generate the ST-124 PDF.");
    } finally {
      setSt124Generating(false);
    }
  };

  const printContract = () => {
    const STYLE_ID = "du-contract-print-style";

    // Remove any leftover style from a previous attempt
    document.getElementById(STYLE_ID)?.remove();

    const runningHeader =
      mode === "st124"
        ? "Decks Unique Inc.  —  NYS Form ST-124 Certificate of Capital Improvement"
        : "Decks Unique Inc.  —  Contract";

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.setAttribute("media", "print");
    style.textContent = `
      /* Page 1 gets a tighter top margin (no running header to make room for);
         pages 2+ keep enough top room for the italic running header. */
      @page {
        size: letter;
        margin: 0.6in 0.6in 0.55in 0.6in;

        @top-left {
          content: "${runningHeader.replace(/—/g, "\\2014")}";
          font-family: "EB Garamond", Garamond, "Times New Roman", serif;
          font-size: 9pt;
          font-style: italic;
          color: #6b6f76;
          padding-bottom: 10pt;
          vertical-align: bottom;
        }

        @bottom-center {
          content: counter(page) " of " counter(pages);
          font-family: "EB Garamond", Garamond, "Times New Roman", serif;
          font-size: 9pt;
          font-style: italic;
          color: #6b6f76;
          padding-top: 8pt;
          vertical-align: top;
        }
      }

      @page :first {
        margin-top: 0.4in;
        @top-left { content: ""; }
      }
    `;
    document.head.appendChild(style);

    const cleanup = () => {
      document.getElementById(STYLE_ID)?.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);

    window.print();
  };

  // ============================================================
  // Render
  // ============================================================
  // Build "City, ST 12345-6789" with a non-breaking hyphen inside the ZIP+4
  // and a non-breaking space between state and ZIP, so the printed line
  // can't wrap mid-number.
  const cityStateZip = (() => {
    const city = (c.hdrCity || "").trim();
    const state = (c.hdrState || "").trim();
    const zip = (c.hdrZip || "").trim().replace(/-/g, "‑"); // U+2011 non-breaking hyphen
    const cs = [city, state].filter(Boolean).join(", ");
    return [cs, zip].filter(Boolean).join(" "); // NBSP between state and zip
  })();

  return (
    <div className={`contract-page contract-mode-${mode}`}>
      {/* ============================ Toolbar ============================ */}
      <div className="contract-toolbar no-print">
        <div className="contract-toolbar-left">
          <h1 className="contract-toolbar-title">Contract</h1>
          {c.hdrClient && (
            <span className="contract-toolbar-meta">· {c.hdrClient}</span>
          )}
        </div>

        <div className="contract-toolbar-center">
          <div className="contract-mode-switch" role="tablist" aria-label="View mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "edit"}
              className={`contract-mode-pill ${mode === "edit" ? "active" : ""}`}
              onClick={() => setMode("edit")}
            >
              Edit
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "preview"}
              className={`contract-mode-pill ${mode === "preview" ? "active" : ""}`}
              onClick={() => setMode("preview")}
            >
              Preview
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "st124"}
              className={`contract-mode-pill ${mode === "st124" ? "active" : ""}`}
              onClick={() => setMode("st124")}
              title="NYS Form ST-124 Certificate of Capital Improvement"
            >
              ST-124
            </button>
          </div>
        </div>

        <div className="contract-toolbar-right">
          <span className="contract-save-pill" title="Contract saves with the .DUest file">
            Saves with file
          </span>
          <button
            type="button"
            className="contract-btn contract-btn-primary"
            onClick={printContract}
          >
            Print
          </button>
          <button
            type="button"
            className="contract-btn contract-btn-ghost"
            onClick={handleReset}
          >
            Reset
          </button>
        </div>
      </div>

      {/* ============================ EDIT MODE ============================ */}
      {mode === "edit" && (
        <div className="contract-edit no-print">
          {/* Client */}
          <section className="contract-card">
            <header className="contract-card-header">
              <h2>Client & Job Site</h2>
              {autoClientName && !c.hdrTouched.client && (
                <span className="contract-pill contract-pill-auto">
                  Auto-filled from estimate
                </span>
              )}
            </header>

            <div className="contract-grid contract-grid-2">
              <FieldInput
                label="Client name"
                value={c.hdrClient}
                onChange={(v) => setHdrField("client", v)}
                placeholder="John &amp; Jane Smith"
              />
              <FieldInput
                label="Phone"
                value={c.hdrPhone}
                onChange={(v) => setHdrField("phone", v)}
                placeholder="(631) 555-1234"
              />
            </div>

            <div className="contract-grid contract-grid-2">
              <FieldInput
                label="Street address"
                value={c.hdrAddress}
                onChange={(v) => setHdrField("address", v)}
                placeholder="123 Main St"
              />
              <FieldInput
                label="Email"
                value={c.hdrEmail}
                onChange={(v) => setHdrField("email", v)}
                placeholder="smith@example.com"
              />
            </div>

            <div className="contract-grid contract-grid-3">
              <FieldInput
                label="City"
                value={c.hdrCity}
                onChange={(v) => setHdrField("city", v)}
                placeholder="Huntington"
              />
              <FieldInput
                label="State"
                value={c.hdrState}
                onChange={(v) => setHdrField("state", v)}
                placeholder="NY"
              />
              <FieldInput
                label="ZIP"
                value={c.hdrZip}
                onChange={(v) => setHdrField("zip", v)}
                placeholder="11743"
              />
            </div>

            <FieldInput
              label="Contract date"
              value={c.hdrDate}
              onChange={(v) => update({ hdrDate: v })}
            />
          </section>

          {/* Schedule */}
          <section className="contract-card">
            <header className="contract-card-header">
              <h2>Schedule</h2>
            </header>
            <div className="contract-grid contract-grid-2">
              <FieldInput
                label="Approximate start"
                value={c.hdrApproxStart}
                onChange={(v) => update({ hdrApproxStart: v })}
                placeholder="Jun 15, 2026"
              />
              <FieldInput
                label="Approximate end"
                value={c.hdrApproxEnd}
                onChange={(v) => update({ hdrApproxEnd: v })}
                placeholder="Jul 30, 2026"
              />
            </div>
            <div className="contract-radio-row">
              <label className="contract-radio">
                <input
                  type="radio"
                  name="essence"
                  checked={c.hdrEssence === "not"}
                  onChange={() => update({ hdrEssence: "not" })}
                />
                <span>
                  Completion date <strong>is NOT</strong> of the essence
                </span>
              </label>
              <label className="contract-radio">
                <input
                  type="radio"
                  name="essence"
                  checked={c.hdrEssence === "yes"}
                  onChange={() => update({ hdrEssence: "yes" })}
                />
                <span>
                  Completion date <strong>IS</strong> of the essence
                </span>
              </label>
            </div>
          </section>

          {/* Scope */}
          <section className="contract-card">
            <header className="contract-card-header">
              <h2>We hereby submit specification for:</h2>
              <div className="contract-card-header-right">
                {!c.specificationTouched ? (
                  <span className="contract-pill contract-pill-auto">
                    Auto-generated
                  </span>
                ) : (
                  <button
                    type="button"
                    className="contract-link-btn"
                    onClick={() =>
                      update({
                        specificationText: autoSpecification,
                        specificationTouched: false,
                      })
                    }
                  >
                    ↻ Reset to auto
                  </button>
                )}
              </div>
            </header>
            <SpecLineEditor
              value={c.specificationText}
              onChange={(v) =>
                update({ specificationText: v, specificationTouched: true })
              }
            />
            <div className="contract-meta-row">
              <span className="contract-meta-text">
                {specLines.length} line{specLines.length === 1 ? "" : "s"}
              </span>
              <label className="contract-check">
                <input
                  type="checkbox"
                  checked={c.forcePageBreak}
                  onChange={(e) => update({ forcePageBreak: e.target.checked })}
                />
                <span>Force payment terms onto page 2 when printing</span>
              </label>
            </div>
          </section>

          {/* Sum & Payment */}
          <section className="contract-card">
            <header className="contract-card-header">
              <h2>Contract Sum &amp; Payment</h2>
            </header>

            <div className="contract-grid contract-grid-2">
              <div className="contract-field">
                <label className="contract-field-label">Total amount</label>
                <div className="contract-money">
                  <span className="contract-money-prefix">$</span>
                  <input
                    className="contract-input contract-input-money"
                    value={c.contractSumNumerals}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^\d]/g, "");
                      const num = raw ? Number(raw) : 0;
                      update({
                        contractSumNumerals: raw ? num.toLocaleString("en-US") : "",
                        contractSumWords: numberToWords(num),
                      });
                    }}
                    placeholder="25,500"
                    inputMode="decimal"
                  />
                </div>
                {c.contractSumWords && (
                  <div className="contract-field-helper">
                    {c.contractSumWords} USD 00/100
                  </div>
                )}
              </div>

              <div className="contract-field">
                <label className="contract-field-label">Payment schedule</label>
                <div className="contract-mode-switch contract-payment-switch">
                  <button
                    type="button"
                    className={`contract-mode-pill ${c.paymentMode === "basic" ? "active" : ""}`}
                    onClick={() => update({ paymentMode: "basic" })}
                  >
                    Basic
                  </button>
                  <button
                    type="button"
                    className={`contract-mode-pill ${c.paymentMode === "staged" ? "active" : ""}`}
                    onClick={() => update({ paymentMode: "staged" })}
                  >
                    Staged
                  </button>
                </div>
              </div>
            </div>

            {c.paymentMode === "basic" ? (
              <div className="contract-field">
                <label className="contract-field-label">Schedule description</label>
                <textarea
                  className="contract-textarea contract-textarea-sm"
                  value={c.paymentScheduleText}
                  onChange={(e) => update({ paymentScheduleText: e.target.value })}
                  rows={2}
                  placeholder={DEFAULT_PAYMENT_TEXT}
                />
              </div>
            ) : (
              <div className="contract-paytable">
                <div className="contract-paytable-head">
                  <div>Stage</div>
                  <div>%</div>
                  <div>Amount</div>
                </div>
                {(["deposit", "dayOne", "afterDecking", "holdback"] as const).map((key) => {
                  const amt =
                    key === "deposit"
                      ? paymentMath.depositAmt
                      : key === "dayOne"
                        ? paymentMath.dayOneAmt
                        : key === "afterDecking"
                          ? paymentMath.afterDeckingAmt
                          : paymentMath.holdbackAmt;
                  return (
                    <div className="contract-paytable-row" key={key}>
                      <input
                        className="contract-input"
                        value={c.paymentLabels[key]}
                        onChange={(e) =>
                          update({
                            paymentLabels: { ...c.paymentLabels, [key]: e.target.value },
                          })
                        }
                      />
                      <div className="contract-pct">
                        <input
                          type="number"
                          className="contract-input"
                          value={c.paymentPercents[key]}
                          onChange={(e) =>
                            update({
                              paymentPercents: {
                                ...c.paymentPercents,
                                [key]: Number(e.target.value || 0),
                              },
                            })
                          }
                        />
                        <span>%</span>
                      </div>
                      <div className="contract-paytable-amt">{paymentMath.fmt(amt)}</div>
                    </div>
                  );
                })}
                <div className="contract-paytable-row contract-paytable-balance">
                  <input
                    className="contract-input"
                    value={c.paymentLabels.balance}
                    onChange={(e) =>
                      update({
                        paymentLabels: { ...c.paymentLabels, balance: e.target.value },
                      })
                    }
                  />
                  <div className="contract-pct contract-pct-readonly">{paymentMath.bal}%</div>
                  <div className="contract-paytable-amt">
                    {paymentMath.fmt(paymentMath.balanceAmt)}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Legal */}
          <section className="contract-card">
            <header className="contract-card-header">
              <h2>Terms &amp; Conditions</h2>
              <button
                type="button"
                className="contract-link-btn"
                onClick={() => update({ legalDisclaimerText: DEFAULT_LEGAL })}
              >
                ↻ Reset to default
              </button>
            </header>
            <textarea
              className="contract-textarea"
              value={c.legalDisclaimerText}
              onChange={(e) =>
                update({
                  legalDisclaimerText: e.target.value.replace(/\n\s*\n/g, "\n"),
                })
              }
              rows={8}
            />
          </section>
        </div>
      )}

      {/* ============================ PREVIEW / PRINT ============================ */}
      <div
        className={`contract-preview-wrap ${mode === "preview" ? "" : "contract-preview-hidden"}`}
      >
        <article className="contract-doc">
          {/* Doc header — 3-column letterhead:
              LEFT  : logo only
              CENTER: CONTRACT title
              RIGHT : company address + phone */}
          <header className="contract-doc-header">
            <div className="contract-doc-header-row">
              <div className="contract-doc-header-left">
                <img
                  className="contract-doc-logo"
                  src={companyLogo || "/DU-log.png"}
                  alt={`${companyName} logo`}
                />
              </div>
              <div className="contract-doc-header-center">
                <div className="contract-doc-title">Contract</div>
              </div>
              <div className="contract-doc-header-right">
                <div className="contract-doc-header-companyline">
                  119 Commack Road
                </div>
                <div className="contract-doc-header-companyline">
                  Commack, NY 11725
                </div>
                <div className="contract-doc-header-companyline">
                  631.266.3004
                </div>
              </div>
            </div>
            <div className="contract-doc-divider" aria-hidden="true" />
          </header>

          {/* Client info card — 2 columns:
              LEFT  : Address, City & State
              RIGHT : Phone, Email, Approximate Start Date, essence checkbox */}
          <section className="contract-doc-summary contract-doc-summary--card">
            <div className="contract-doc-summary-label">
              Prepared for:{" "}
              <span className="contract-doc-summary-name">
                {c.hdrClient || "—"}
              </span>
              {c.hdrDate && (
                <>
                  , on{" "}
                  <em className="contract-doc-summary-date">
                    {formatLongDate(c.hdrDate)}
                  </em>
                </>
              )}
            </div>
            <div className="contract-doc-client-grid">
              <div className="contract-doc-client-col">
                <dl className="contract-doc-client-list">
                  <div className="contract-doc-client-row">
                    <dt>Address:</dt>
                    <dd>{c.hdrAddress || "—"}</dd>
                  </div>
                  <div className="contract-doc-client-row">
                    <dt>City &amp; State:</dt>
                    <dd>{cityStateZip || "—"}</dd>
                  </div>
                </dl>
              </div>
              <div className="contract-doc-client-col">
                <dl className="contract-doc-client-list">
                  <div className="contract-doc-client-row">
                    <dt>Phone:</dt>
                    <dd>{c.hdrPhone || "—"}</dd>
                  </div>
                  <div className="contract-doc-client-row">
                    <dt>Email:</dt>
                    <dd>{c.hdrEmail || "—"}</dd>
                  </div>
                  <div className="contract-doc-client-row">
                    <dt>Approx. Start:</dt>
                    <dd>
                      {c.hdrApproxStart || c.hdrApproxEnd
                        ? `${c.hdrApproxStart || "TBD"} → ${c.hdrApproxEnd || "TBD"}`
                        : "TBD"}
                    </dd>
                  </div>
                </dl>
                <div className="contract-doc-client-essence">
                  The Contractor and the owner have determined that a definite
                  completion date{" "}
                  {c.hdrEssence === "yes" ? "is of the essence" : "is NOT of the essence"}.
                </div>
              </div>
            </div>
          </section>

          {/* Scope */}
          <section className="contract-doc-section contract-doc-section--scope">
            <h2 className="contract-doc-h2">We hereby submit specification for:</h2>
            {specLines.length === 0 ? (
              <p className="contract-doc-body contract-doc-empty">
                Add specifications in Edit mode.
              </p>
            ) : (
              <ul className="contract-doc-scope">
                {specLines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
          </section>

          {(c.forcePageBreak || specLines.length > 15) && (
            <div className="contract-doc-pagebreak" />
          )}

          {/* Contract Sum — body sentence + words on the left,
              dollar amount right-aligned on the same row */}
          <section className="contract-doc-section">
            <h2 className="contract-doc-h2">Contract Sum</h2>
            <div className="contract-doc-sumcombined">
              <p className="contract-doc-sumcombined-text">
                We propose to furnish material and labor — complete in accordance
                with the above specifications — for the sum of:{" "}
                <em className="contract-doc-sumcombined-words">
                  {c.contractSumWords
                    ? `${c.contractSumWords} USD 00/100`
                    : "—"}
                </em>
              </p>
              <div className="contract-doc-sumcombined-amount">
                ${c.contractSumNumerals || "—"}
              </div>
            </div>
          </section>

          {/* Payment */}
          <section className="contract-doc-section">
            <h2 className="contract-doc-h2">Payment Schedule</h2>
            {/* Screen-only: keep the editable-table preview if staged */}
            {c.paymentMode === "staged" ? (
              <table className="contract-doc-paytable screen-only">
                <tbody>
                  <tr>
                    <td>{c.paymentLabels.deposit}</td>
                    <td>{paymentMath.dep}%</td>
                    <td>{paymentMath.fmt(paymentMath.depositAmt)}</td>
                  </tr>
                  <tr>
                    <td>{c.paymentLabels.dayOne}</td>
                    <td>{paymentMath.d1}%</td>
                    <td>{paymentMath.fmt(paymentMath.dayOneAmt)}</td>
                  </tr>
                  <tr>
                    <td>{c.paymentLabels.afterDecking}</td>
                    <td>{paymentMath.ad}%</td>
                    <td>{paymentMath.fmt(paymentMath.afterDeckingAmt)}</td>
                  </tr>
                  {paymentMath.hb > 0 && (
                    <tr>
                      <td>{c.paymentLabels.holdback}</td>
                      <td>{paymentMath.hb}%</td>
                      <td>{paymentMath.fmt(paymentMath.holdbackAmt)}</td>
                    </tr>
                  )}
                  <tr className="contract-doc-paytable-balance">
                    <td>{c.paymentLabels.balance}</td>
                    <td>{paymentMath.bal}%</td>
                    <td>{paymentMath.fmt(paymentMath.balanceAmt)}</td>
                  </tr>
                </tbody>
              </table>
            ) : null}

            {/* Plain text line — always shown in print, also shown on screen for basic mode */}
            <p
              className={`contract-doc-body contract-doc-payline ${c.paymentMode === "staged" ? "print-only" : ""}`}
              style={{ whiteSpace: "pre-wrap" }}
            >
              {c.paymentMode === "basic" ? c.paymentScheduleText : stagedSentence}
            </p>
          </section>

          {/* Terms */}
          <section className="contract-doc-section">
            <h2 className="contract-doc-h2">Terms &amp; Conditions</h2>
            <p className="contract-doc-legal">
              {c.legalDisclaimerText.replace(/\n+/g, " ").trim()}
            </p>
          </section>

          {/* Acceptance */}
          <section className="contract-doc-section contract-doc-acceptance">
            <h2 className="contract-doc-h2">Acceptance of Proposal</h2>
            <p className="contract-doc-body">
              I have read this document and accept the prices, specifications, and
              conditions stated. I understand that upon signing this becomes a binding
              contract. You are authorized to do the work as specified. Payment will be
              made as outlined above.
            </p>
            <div className="contract-doc-sig-row">
              <div className="contract-doc-sig-unit">
                <div className="contract-doc-sig-lines">
                  <div className="contract-doc-sig-line contract-doc-sig-line--main" />
                  <div className="contract-doc-sig-line contract-doc-sig-line--date" />
                </div>
                <div className="contract-doc-sig-labels">
                  <span>Client Signature</span>
                  <span>Date</span>
                </div>
              </div>
              <div className="contract-doc-sig-unit">
                <div className="contract-doc-sig-lines">
                  <div className="contract-doc-sig-line contract-doc-sig-line--main" />
                  <div className="contract-doc-sig-line contract-doc-sig-line--date" />
                </div>
                <div className="contract-doc-sig-labels">
                  <span>Authorized Signature</span>
                  <span>Date</span>
                </div>
              </div>
            </div>
          </section>

          {/* Cancellation */}
          <section className="contract-doc-cancel">
            <p>
              <strong>Notice of Cancellation.</strong> You, the buyer, may cancel
              this transaction at any time prior to midnight of the third (3rd)
              business day following the date of this agreement.
            </p>
          </section>

          {/* Footer */}
          <footer className="contract-doc-footer">
            <span>Nassau H18607600</span>
            <span>Suffolk 1614-H</span>
          </footer>
        </article>
      </div>

      {/* ============================ ST-124 ============================ */}
      <div
        className={`contract-st124-wrap ${mode === "st124" ? "" : "contract-st124-hidden"}`}
      >
        <article className="contract-st124">
          <header className="contract-st124-header">
            <div className="contract-st124-header-left">
              <div className="contract-st124-state">New York State</div>
              <div className="contract-st124-dept">
                Department of Taxation and Finance
              </div>
            </div>
            <div className="contract-st124-header-right">
              <div className="contract-st124-formcode">ST-124</div>
              <div className="contract-st124-formrev">(Rev.)</div>
            </div>
          </header>

          <h1 className="contract-st124-title">
            Certificate of Capital Improvement
          </h1>

          <p className="contract-st124-instructions">
            After this certificate is completed and signed by both the customer
            and the contractor, the contractor must keep it in its records as
            evidence that the work performed is a capital improvement and is
            not subject to New York State sales tax on labor.{" "}
            <strong>Do not file this form with the Tax Department.</strong>
          </p>

          <div className="contract-st124-action no-print">
            <div className="contract-st124-action-text">
              <strong>Generate the official ST-124 PDF</strong>
              <div>
                Downloads the populated NY State fillable form using the data
                above. Print or save as your tax record.
              </div>
            </div>
            <div className="contract-st124-action-controls">
              <button
                type="button"
                className="contract-btn contract-btn-primary"
                onClick={handleGenerateST124}
                disabled={st124Generating}
              >
                {st124Generating ? "Generating…" : "Generate ST-124"}
              </button>
              {st124Error && (
                <div className="contract-st124-action-error">{st124Error}</div>
              )}
            </div>
          </div>

          {/* PART 1 — CUSTOMER */}
          <section className="contract-st124-part">
            <div className="contract-st124-part-title">
              Part 1 — To be completed by the customer (purchaser of services)
            </div>

            <div className="contract-st124-grid">
              <div className="contract-st124-field">
                <div className="contract-st124-label">Customer name</div>
                <div className="contract-st124-value">
                  {c.hdrClient || "—"}
                </div>
              </div>
              <div className="contract-st124-field">
                <div className="contract-st124-label">Date</div>
                <div className="contract-st124-value">
                  {formatLongDate(c.hdrDate) || "—"}
                </div>
              </div>
            </div>

            <div className="contract-st124-field">
              <div className="contract-st124-label">Customer mailing address</div>
              <div className="contract-st124-value">
                {[c.hdrAddress, cityStateZip].filter(Boolean).join(", ") || "—"}
              </div>
            </div>

            <div className="contract-st124-grid">
              <div className="contract-st124-field">
                <div className="contract-st124-label">Phone</div>
                <div className="contract-st124-value">{c.hdrPhone || "—"}</div>
              </div>
              <div className="contract-st124-field">
                <div className="contract-st124-label">Email</div>
                <div className="contract-st124-value">{c.hdrEmail || "—"}</div>
              </div>
            </div>

            <div className="contract-st124-field">
              <div className="contract-st124-label">
                Project location (if different from mailing address)
              </div>
              <div className="contract-st124-value">Same as above</div>
            </div>

            <div className="contract-st124-field">
              <div className="contract-st124-label">
                Description of capital improvement{" "}
                {!c.st124ProjectDescriptionTouched && (
                  <span className="contract-st124-autopill">auto</span>
                )}
              </div>
              <textarea
                className="contract-st124-textarea"
                value={c.st124ProjectDescription}
                onChange={(e) =>
                  update({
                    st124ProjectDescription: e.target.value,
                    st124ProjectDescriptionTouched: true,
                  })
                }
                rows={2}
                spellCheck
                autoCorrect="on"
                autoCapitalize="sentences"
                placeholder="Brief description of the work (auto-generated from the estimate)."
              />
            </div>

            <p className="contract-st124-cert">
              I, the undersigned, certify that the work described above
              constitutes a capital improvement to the real property identified
              above, as that term is defined in New York State Sales and Use Tax
              Regulation 20 NYCRR 527.7(a)(3). I understand that issuing this
              certificate for work that is not a capital improvement is fraud
              and may subject me to civil and criminal penalties under the New
              York Tax Law.
            </p>

            <div className="contract-st124-sig-row">
              <div className="contract-st124-sig">
                <div className="contract-st124-sig-line" />
                <div className="contract-st124-sig-label">
                  Customer signature
                </div>
              </div>
              <div className="contract-st124-sig contract-st124-sig--date">
                <div className="contract-st124-sig-line" />
                <div className="contract-st124-sig-label">Date</div>
              </div>
            </div>

            <div className="contract-st124-sig-row">
              <div className="contract-st124-sig">
                <div className="contract-st124-sig-line" />
                <div className="contract-st124-sig-label">
                  Customer printed name
                </div>
              </div>
              <div className="contract-st124-sig contract-st124-sig--date">
                <div className="contract-st124-sig-line" />
                <div className="contract-st124-sig-label">
                  Title (if business)
                </div>
              </div>
            </div>
          </section>

          {/* PART 2 — CONTRACTOR */}
          <section className="contract-st124-part">
            <div className="contract-st124-part-title">
              Part 2 — To be completed by the contractor
            </div>

            <div className="contract-st124-field">
              <div className="contract-st124-label">Contractor name</div>
              <div className="contract-st124-value">{companyName}</div>
            </div>

            <div className="contract-st124-field">
              <div className="contract-st124-label">Contractor address</div>
              <div className="contract-st124-value">
                119 Commack Road, Commack, NY 11725
              </div>
            </div>

            <div className="contract-st124-grid">
              <div className="contract-st124-field">
                <div className="contract-st124-label">Phone</div>
                <div className="contract-st124-value">631.266.3004</div>
              </div>
              <div className="contract-st124-field">
                <div className="contract-st124-label">
                  NYS Certificate of Authority #
                </div>
                <div className="contract-st124-value contract-st124-value-blank">
                  &nbsp;
                </div>
              </div>
            </div>

            <div className="contract-st124-sig-row">
              <div className="contract-st124-sig">
                <div className="contract-st124-sig-line" />
                <div className="contract-st124-sig-label">
                  Contractor signature
                </div>
              </div>
              <div className="contract-st124-sig contract-st124-sig--date">
                <div className="contract-st124-sig-line" />
                <div className="contract-st124-sig-label">Date</div>
              </div>
            </div>

            <div className="contract-st124-sig-row">
              <div className="contract-st124-sig">
                <div className="contract-st124-sig-line" />
                <div className="contract-st124-sig-label">
                  Contractor printed name
                </div>
              </div>
              <div className="contract-st124-sig contract-st124-sig--date">
                <div className="contract-st124-sig-line" />
                <div className="contract-st124-sig-label">Title</div>
              </div>
            </div>
          </section>

          {/* Definition */}
          <section className="contract-st124-definition">
            <div className="contract-st124-definition-title">
              Definition of capital improvement
            </div>
            <p>
              A capital improvement is an addition or alteration to real
              property that (1) substantially adds to the value of the real
              property or appreciably prolongs its useful life; (2) becomes part
              of the real property or is permanently affixed to it so that
              removal would cause material damage to the property or the
              article itself; and (3) is intended to become a permanent
              installation. (20 NYCRR 527.7(a)(3))
            </p>
          </section>

          {/* Footer license numbers */}
          <footer className="contract-st124-footer">
            <span>Nassau H18607600</span>
            <span>Suffolk 1614-H</span>
          </footer>
        </article>
      </div>
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="contract-field">
      <label className="contract-field-label">{label}</label>
      <input
        className="contract-input"
        type={type || "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

// ============================================================
// SpecLineEditor — line-by-line bullet editor.
// Splits the newline-joined value into rows, each its own input with a
// visible bullet. Enter on a row inserts a new empty row below (and
// focuses it). Backspace on an empty row removes it (and focuses the
// previous row at the end of its text). Multi-line paste is split into
// rows. Underlying data model is unchanged: a single string with \n
// separators stored in c.specificationText.
// ============================================================
function SpecLineEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const lines = useMemo(() => {
    const parts = (value ?? "").split("\n");
    return parts.length === 0 ? [""] : parts;
  }, [value]);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const pendingFocus = useRef<{ idx: number; toEnd?: boolean } | null>(null);

  useEffect(() => {
    if (!pendingFocus.current) return;
    const { idx, toEnd } = pendingFocus.current;
    pendingFocus.current = null;
    const el = inputRefs.current[idx];
    if (!el) return;
    el.focus();
    if (toEnd) {
      const len = el.value.length;
      try {
        el.setSelectionRange(len, len);
      } catch {}
    }
  });

  const commit = (next: string[]) => {
    onChange(next.join("\n"));
  };

  const setLine = (idx: number, val: string) => {
    const next = lines.slice();
    next[idx] = val;
    commit(next);
  };

  const insertAfter = (idx: number, initial = "") => {
    const next = lines.slice();
    next.splice(idx + 1, 0, initial);
    pendingFocus.current = { idx: idx + 1 };
    commit(next);
  };

  const removeAt = (idx: number) => {
    if (lines.length <= 1) {
      pendingFocus.current = { idx: 0 };
      commit([""]);
      return;
    }
    const next = lines.filter((_, i) => i !== idx);
    pendingFocus.current = { idx: Math.max(0, idx - 1), toEnd: true };
    commit(next);
  };

  const onKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const el = e.currentTarget;
      const caret = el.selectionStart ?? el.value.length;
      const before = el.value.slice(0, caret);
      const after = el.value.slice(caret);
      const next = lines.slice();
      next[idx] = before;
      next.splice(idx + 1, 0, after);
      pendingFocus.current = { idx: idx + 1 };
      commit(next);
      return;
    }
    if (e.key === "Backspace") {
      const el = e.currentTarget;
      const caret = el.selectionStart ?? 0;
      // Backspace at column 0 of a non-first line merges with the previous line
      if (caret === 0 && idx > 0) {
        e.preventDefault();
        const prev = lines[idx - 1];
        const cur = lines[idx];
        const next = lines.slice();
        next[idx - 1] = prev + cur;
        next.splice(idx, 1);
        pendingFocus.current = { idx: idx - 1 };
        commit(next);
        // Place cursor at the join point on next paint
        setTimeout(() => {
          const p = inputRefs.current[idx - 1];
          if (p) {
            try {
              p.setSelectionRange(prev.length, prev.length);
            } catch {}
          }
        }, 0);
      }
    }
  };

  const onPaste = (idx: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text || !text.includes("\n")) return;
    e.preventDefault();
    const el = e.currentTarget;
    const caret = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, caret);
    const after = el.value.slice(caret);
    const pasteLines = text.split("\n");
    const next = lines.slice();
    if (pasteLines.length === 1) {
      next[idx] = before + pasteLines[0] + after;
      commit(next);
      return;
    }
    next.splice(
      idx,
      1,
      before + pasteLines[0],
      ...pasteLines.slice(1, -1),
      pasteLines[pasteLines.length - 1] + after
    );
    pendingFocus.current = { idx: idx + pasteLines.length - 1, toEnd: true };
    commit(next);
  };

  return (
    <div className="contract-spec-editor">
      {lines.map((line, idx) => (
        <div className="contract-spec-line" key={idx}>
          <span className="contract-spec-bullet" aria-hidden="true">
            •
          </span>
          <input
            ref={(el) => {
              inputRefs.current[idx] = el;
            }}
            className="contract-spec-input"
            value={line}
            onChange={(e) => setLine(idx, e.target.value)}
            onKeyDown={(e) => onKeyDown(idx, e)}
            onPaste={(e) => onPaste(idx, e)}
            placeholder={idx === 0 ? "Add a specification line…" : ""}
            spellCheck
            autoCorrect="on"
            autoCapitalize="sentences"
            lang="en-US"
          />
        </div>
      ))}
      <button
        type="button"
        className="contract-spec-add"
        onClick={() => insertAfter(lines.length - 1)}
      >
        + Add line
      </button>
    </div>
  );
}
