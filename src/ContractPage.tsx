// src/ContractPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./ContractPage.css";
import { supabase } from "./supabaseClient";
type PricingItemRow = any;

type Props = {
    estimateId: string;
  orgId: string | null;
  // Keep these loose so we don’t fight types while you’re building.
  finalEstimate: number;
  selectedDecking: any;
  selectedRailing: any;
  selectedStairOption: any;
  selectedFastener: any;
  selectedConstruction: any;
  selectedDemo?: any;  
  constructionKey?: string;
  clientTitle?: string;
  selectedSkirting?: any;
  clientLastName?: string;
  clientLocation?: string;
  clientEmail?: string;
  demoType?: string | null;
demoDescription?: string | null;
};

export default function ContractPage(props: Props) {
  const docRef = useRef<HTMLDivElement | null>(null);
const CLIENT_KEY = useMemo(() => {
    const id = (props.estimateId || "").trim();
    return id ? `du_contract_hdr_client::${id}` : "";
  }, [props.estimateId]);

  const SCOPE_KEY = useMemo(() => {
    const id = (props.estimateId || "").trim();
    return id ? `du_contract_scope::${id}` : "";
  }, [props.estimateId]);
  // Editable fields
  const [deposit, setDeposit] = useState<number>(1000);
  const [priceOverride, setPriceOverride] = useState<number | "">("");
  const [startDate, setStartDate] = useState<string>("");
  const [duration, setDuration] = useState<string>("");
  // Payment Terms (editable)
const [paymentSumWords, setPaymentSumWords] = useState<string>("");
const [paymentSumNumerals, setPaymentSumNumerals] = useState<string>("");
const [paymentScheduleText, setPaymentScheduleText] = useState<string>(
  "Payment Schedule: $1,000 deposit w/ contract. Balance due upon project completion."
);
  // Header (manual fill-in fields — NOT auto-populated)
  const [hdrClient, setHdrClient] = useState<string>("");
  const [hdrAddress, setHdrAddress] = useState<string>("");
  const [hdrPhone, setHdrPhone] = useState<string>("");
  const [hdrDate, setHdrDate] = useState<string>(new Date().toLocaleDateString());
  const [hdrPageNum, setHdrPageNum] = useState<string>("1");
  const [hdrPageOf, setHdrPageOf] = useState<string>("1");
    const [hdrApproxStart, setHdrApproxStart] = useState<string>("");
  const [hdrApproxEnd, setHdrApproxEnd] = useState<string>("");
const [hdrEssence, setHdrEssence] = useState<"yes" | "not" | "">("not");
const [constructionScopeText, setConstructionScopeText] = useState<string>("");
  const [projectSummaryText, setProjectSummaryText] = useState<string>("");
  const [scopeOfWorkText, setScopeOfWorkText] = useState<string>("");
  const [projectSummaryTouched, setProjectSummaryTouched] = useState<boolean>(false);
const PROJECT_SUMMARY_KEY = useMemo(() => {
  const oid = (props.orgId || "no-org").trim();
  return `du_contract_project_summary__${oid}`;
}, [props.orgId]);

// ✅ Per-estimate persistence (keyed by estimateId)
// Load when switching files
useEffect(() => {
  if (!CLIENT_KEY || !SCOPE_KEY) return;

  try {
    setHdrClient(localStorage.getItem(CLIENT_KEY) || "");
  } catch {}

  try {
    setScopeOfWorkText(localStorage.getItem(SCOPE_KEY) || "");
  } catch {}
}, [CLIENT_KEY, SCOPE_KEY]);

// Save on change
useEffect(() => {
  if (!CLIENT_KEY) return;
  try {
    localStorage.setItem(CLIENT_KEY, hdrClient);
  } catch {}
}, [CLIENT_KEY, hdrClient]);

useEffect(() => {
  if (!SCOPE_KEY) return;
  try {
    localStorage.setItem(SCOPE_KEY, scopeOfWorkText);
  } catch {}
}, [SCOPE_KEY, scopeOfWorkText]);

  const contractPrice = useMemo(() => {
    const base = Number(props.finalEstimate) || 0;
    const override = priceOverride === "" ? null : Number(priceOverride);
    return override != null && !Number.isNaN(override) ? override : base;
  }, [props.finalEstimate, priceOverride]);
  const companyName = useMemo(() => {
  const tryRead = (key: string) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return "";
      const obj = JSON.parse(raw);
      return (
        (obj?.organizationName ||
          obj?.orgName ||
          obj?.companyName ||
          "") as string
      ).trim();
    } catch {
      return "";
    }
  };

  return (
    tryRead("userSettings") ||
    tryRead("du_user_settings") ||
    tryRead("duUserSettings") ||
    "Decks Unique"
  );
}, []);
const autoProjectSummary = useMemo(() => {
  const lines: string[] = [];

 const pushLine = (s?: string | null) => {
  const t = (s || "").trim();
  if (t) lines.push(`- ${t}`);
};

  // Line 1 — fixed intro
  pushLine(
    "New deck will be built as per the sketch plans and 3D renderings that will be emailed prior for approval."
  );

  // Line 2 — Demolition (USE BLURB, fallback to name)
  const demoName = (props.demoType || "").trim();
  const demoBlurb = (props.demoDescription || "").trim();

  if (demoBlurb) {
    pushLine(`Demolition: ${demoBlurb}`);
  } else if (demoName) {
    pushLine(`Demolition: ${demoName}.`);
  }
  // Line 3 — Decking
  const deckingName = (props.selectedDecking?.name || props.selectedDecking?.label || "").trim();
  const fastenerName = (props.selectedFastener?.name || props.selectedFastener?.label || "").trim();

  if (deckingName && fastenerName) {
    pushLine(
      `${companyName} will supply and install ${deckingName} secured with ${fastenerName}. Decking color to be selected (TBD).`
    );
  } else if (deckingName) {
    pushLine(
      `${companyName} will supply and install ${deckingName}. Decking color to be selected (TBD).`
    );
  }
    // Line 4 — Railing
  const railingName = (props.selectedRailing?.name || props.selectedRailing?.label || "").trim();

  if (railingName) {
    pushLine(
      `${companyName} will supply and install ${railingName} railing system. Railing color to be selected (TBD).`
    );
  }
    // Line 5 — Stairs
  const stairName = (props.selectedStairOption?.name || props.selectedStairOption?.label || "").trim();
  const stairBlurb = (props.selectedStairOption?.proposal_description || "").trim();

  if (stairBlurb) {
    pushLine(`Stairs: ${stairBlurb}`);
  } else if (stairName) {
    pushLine(`${companyName} will supply and install ${stairName}.`);
  }
    // Line 6 — Skirting / Lattice
  const skirtingName = (props.selectedSkirting?.name || props.selectedSkirting?.label || "").trim();
  const skirtingBlurb = (props.selectedSkirting?.proposal_description || "").trim();

  if (skirtingBlurb) {
    pushLine(`Skirting: ${skirtingBlurb}`);
  } else if (skirtingName) {
    pushLine(`${companyName} will supply and install ${skirtingName}.`);
  }
  // (keep your scope text / constructionScopeText lines wherever you want them)
  // pushLine(constructionScopeText);

  return lines.join("\n"); // ✅ IMPORTANT: no blank line
}, [props.demoType, 
  props.demoDescription, 
  props.selectedDecking, props.selectedFastener, 
  props.selectedRailing, 
  props.selectedStairOption,
  companyName /*, constructionScopeText */]);
    useEffect(() => {
    if (projectSummaryTouched) return;
    setProjectSummaryText(autoProjectSummary);
  }, [autoProjectSummary, projectSummaryTouched]);
  useEffect(() => {
  try {
    const saved = (localStorage.getItem(PROJECT_SUMMARY_KEY) || "").trim();
    if (saved) {
      setProjectSummaryTouched(true);
      setProjectSummaryText(saved);
    }
  } catch {
    // ignore
  }
}, [PROJECT_SUMMARY_KEY]);
  const clientName = useMemo(() => {
    const t = (props.clientTitle || "").trim();
    const ln = (props.clientLastName || "").trim();
    const combined = [t, ln].filter(Boolean).join(" ");
    return combined || "Client";
  }, [props.clientTitle, props.clientLastName]);

  const location = (props.clientLocation || "").trim();
React.useEffect(() => {
  const key = (props.constructionKey || "").trim();
console.log("selectedConstruction object:", props.selectedConstruction);  if (!key) {
    setConstructionScopeText("");
    return;
  }

  let cancelled = false;

  (async () => {
 // 1) Try match by label (e.g., "New Construction")
let { data, error } = await supabase
  .from("sow_templates")
  .select("body")
  .eq("label", key)
  .maybeSingle();

// 2) If not found, try match by construction_key (e.g., "new_construction")
if (!data?.body) {
  const resp = await supabase
    .from("sow_templates")
    .select("body")
    .eq("construction_key", key)
    .maybeSingle();

  data = resp.data;
  error = resp.error;
}
    if (cancelled) return;

    if (error) {
      console.warn("Failed to load sow template:", error.message);
      setConstructionScopeText("");
      return;
    }

    setConstructionScopeText((data?.body || "").trim());
  })();

  return () => {
    cancelled = true;
  };
}, [props.constructionKey]);
  const printContract = () => {
    // simplest: use browser print, and CSS will hide app chrome if you want later
    window.print();
  };

  return (
    <div className="contract-page">
      {/* Screen-only actions */}
      <div className="contract-actions no-print">
        <button className="du-btn" onClick={printContract}>
          Print Contract
        </button>
      </div>

      <div id="contract-doc" className="contract-doc" ref={docRef}>
        {/* Watermark (optional image) */}
        {/* <img className="contract-watermark" src="/DU-logo.png" alt="" /> */}

  
<header className="contract-head contract-head--frame">
  <div className="contract-frame">
    {/* LEFT: Client fields */}
    <div className="contract-frame-left">
      <div className="contract-fieldRow">
        <div className="contract-fieldLabel">Client</div>
<input
  className="contract-fieldInput"
  value={hdrClient}
  onChange={(e) => setHdrClient(e.target.value)}
  placeholder="Client name"
/>
      </div>

      <div className="contract-fieldRow">
        <div className="contract-fieldLabel">Client Address</div>
<input
  className="contract-fieldInput"
  value={hdrAddress}
  onChange={(e) => setHdrAddress(e.target.value)}
  placeholder="Client address"
/>
      </div>

      <div className="contract-fieldRow contract-fieldRow--two">
        <div className="contract-fieldHalf">
          <div className="contract-fieldLabel">Phone</div>
<input
  className="contract-fieldInput"
  value={hdrPhone}
  onChange={(e) => setHdrPhone(e.target.value)}
  placeholder="Phone"
/>
        </div>
        <div className="contract-fieldHalf">
          <div className="contract-fieldLabel">Date</div>
<input
  className="contract-fieldInput"
  value={hdrDate}
  onChange={(e) => setHdrDate(e.target.value)}
  placeholder="Date"
/>
        </div>
      </div>
    </div>

    {/* CENTER: Title + Logo + Company info */}
    <div className="contract-frame-center">
  <div className="contract-frame-top">
    <div className="contract-frame-title">Contract</div>
    <div className="contract-frame-tagline">"Pride and Quality Make Decks Unique"</div>
  </div>

<img className="contract-watermark" src="/DU-watermark.png" alt="" />
  <div className="contract-frame-company">
  <div className="contract-company-address">119 Commack Rd, Commack NY 11725</div>
  <div className="contract-company-phone">631.266.3004</div>
</div>
</div>

    {/* RIGHT: Page + schedule fields */}
    <div className="contract-frame-right">
      <div className="contract-pageRow">
  <span>Page</span>
  <input
    className="contract-pageInput"
    value={hdrPageNum}
    onChange={(e) => setHdrPageNum(e.target.value)}
    aria-label="Page number"
  />
  <span>Of</span>
  <input
    className="contract-pageInput"
    value={hdrPageOf}
    onChange={(e) => setHdrPageOf(e.target.value)}
    aria-label="Total pages"
  />
</div>
<div className="contract-rightBox contract-rightBox--inline">
  <div className="contract-inlineRow">
    <span className="contract-inlineLabel">Approximate Start Date</span>
    <input
      className="contract-inlineInput"
      value={hdrApproxStart}
      onChange={(e) => setHdrApproxStart(e.target.value)}
      placeholder=""
      aria-label="Approximate start date"
    />
  </div>

  <div className="contract-inlineRow">
    <span className="contract-inlineLabel">Approximate End Date</span>
    <input
      className="contract-inlineInput"
      value={hdrApproxEnd}
      onChange={(e) => setHdrApproxEnd(e.target.value)}
      placeholder=""
      aria-label="Approximate end date"
    />
  </div>
</div>



     

      <div className="contract-rightNote">
        The Contractor and the owner have determined that a definite completion date:
<div className="contract-checkRow contract-checkRow--inline">
  <label className="contract-checkItem">
    <input
      type="checkbox"
      checked={hdrEssence === "not"}
      onChange={() => setHdrEssence("not")}
    />
    <span>Is Not of the essence</span>
  </label>

  <label className="contract-checkItem">
    <input
      type="checkbox"
      checked={hdrEssence === "yes"}
      onChange={() => setHdrEssence("yes")}
    />
    <span>Is of the essence</span>
  </label>
</div>

    </div>
  </div>
  </div>
</header>


<section className="contract-section">
  <div className="contract-linedBox">
    <div className="contract-linedHeader">
      WE HEREBY SUBMIT SPECIFICATION FOR:
    </div>
  {/* Screen editing */}
  <textarea
    className="contract-linedTextarea no-print"
    value={projectSummaryText}
    onChange={(e) => {
      const next = e.target.value;
      setProjectSummaryTouched(true);
      setProjectSummaryText(next);
      try {
        localStorage.setItem(PROJECT_SUMMARY_KEY, next);
      } catch {
        // ignore
      }
    }}
  />

  {/* Print rendering (no scrollbars, true text layout) */}
  <div className="contract-linedPrint print-only">
    {projectSummaryText}
  </div>
</div>
{/* Scope of Work */}
<div className="contract-linedBox" style={{ marginTop: 14 }}>
  <div className="contract-linedHeader">SCOPE OF WORK</div>

  <textarea
    className="contract-linedTextarea no-print"
    value={scopeOfWorkText}
    onChange={(e) => setScopeOfWorkText(e.target.value)}
    placeholder="Type scope of work…"
    rows={6}
  />

  <div className="contract-linedPrint print-only">{scopeOfWorkText}</div>
</div>
{/* Payment Terms */}
<div className="contract-paymentBox">
  <div className="contract-paymentTitle">
    We propose to hereby to furnish material and labor – complete in accordance with the above
    specifications, for the sum of:
  </div>

 <div className="contract-paymentRow">
  <div className="contract-paymentWords">
    <div className="contract-paymentLabel">dollars</div>
    <input
      className="contract-paymentWordsInput"
      value={paymentSumWords}
      onChange={(e) => setPaymentSumWords(e.target.value)}
      placeholder="Type amount in words"
    />
  </div>

  <div className="contract-paymentRightColumn">
    <div className="contract-paymentNumerals">
      <div className="contract-paymentNumeralsLabel">($</div>
      <input
        className="contract-paymentNumeralsInput"
        value={paymentSumNumerals}
        onChange={(e) => setPaymentSumNumerals(e.target.value)}
        inputMode="decimal"
      />
      <div className="contract-paymentNumeralsLabel">)</div>
    </div>

    <div className="contract-authorizedSigInline">
      <div className="contract-authorizedLabel">Authorized Signature</div>
      <div className="contract-authorizedLine" />
    </div>
  </div>
</div>
  <div className="contract-paymentSchedule">
    <textarea
      className="contract-paymentScheduleInput"
      value={paymentScheduleText}
      onChange={(e) => setPaymentScheduleText(e.target.value)}
      rows={2}
    />
  <div className="contract-paymentBottom">
  <div className="contract-cancelTextCentered">
    You, the buyer, may cancel at any time prior to midnight of the third business day after the date of this transaction.
  </div>

  <div className="contract-authorizedSigCentered">
    <div className="contract-authorizedLabel">Authorized Signature</div>
    <div className="contract-authorizedLine" />
  </div>
</div>
  </div>
</div>
</section>

       
      

     
        <footer className="contract-foot">
          <span>Nassau H18607600</span> <span>Suffolk 1614-H</span>
        </footer>
      </div>

    </div>
  );
}
