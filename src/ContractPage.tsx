// src/ContractPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./ContractPage.css";
import { supabase } from "./supabaseClient";
type PricingItemRow = any;

type Props = {
  // Keep these loose so we don’t fight types while you’re building.
  finalEstimate: number;
  selectedDecking: any;
  selectedRailing: any;
  selectedStairOption: any;
  selectedFastener: any;
  selectedConstruction: any;
  constructionKey?: string;
  clientTitle?: string;
  clientLastName?: string;
  clientLocation?: string;
  clientEmail?: string;
};

export default function ContractPage(props: Props) {
  const docRef = useRef<HTMLDivElement | null>(null);

  // Editable fields
  const [deposit, setDeposit] = useState<number>(1000);
  const [priceOverride, setPriceOverride] = useState<number | "">("");
  const [startDate, setStartDate] = useState<string>("");
  const [duration, setDuration] = useState<string>("");
  // Header (manual fill-in fields — NOT auto-populated)
  const [hdrClient, setHdrClient] = useState<string>("");
  const [hdrAddress, setHdrAddress] = useState<string>("");
  const [hdrPhone, setHdrPhone] = useState<string>("");
  const [hdrDate, setHdrDate] = useState<string>(new Date().toLocaleDateString());
  const [hdrPageNum, setHdrPageNum] = useState<string>("1");
  const [hdrPageOf, setHdrPageOf] = useState<string>("1");
    const [hdrApproxStart, setHdrApproxStart] = useState<string>("");
  const [hdrApproxEnd, setHdrApproxEnd] = useState<string>("");
const [hdrEssence, setHdrEssence] = useState<"yes" | "not" | "">("");
const [constructionScopeText, setConstructionScopeText] = useState<string>("");
  const [projectSummaryText, setProjectSummaryText] = useState<string>("");
  const [projectSummaryTouched, setProjectSummaryTouched] = useState<boolean>(false);




  const contractPrice = useMemo(() => {
    const base = Number(props.finalEstimate) || 0;
    const override = priceOverride === "" ? null : Number(priceOverride);
    return override != null && !Number.isNaN(override) ? override : base;
  }, [props.finalEstimate, priceOverride]);
 const autoProjectSummary = useMemo(() => {
  const lines: string[] = [];

  // Line 1 — fixed intro (as requested)
  lines.push(
    "New deck will be built as per the sketch plans and 3D renderings that will be emailed prior for approval."
  );

  // Line 2 — pulled from Supabase sow_templates.body
  if (constructionScopeText) {
    lines.push(constructionScopeText);
  } else {
    lines.push("Demolition and structural preparation will be completed per the approved scope of work.");
  }

  return lines.join("\n\n");
}, [constructionScopeText]);
    useEffect(() => {
    if (projectSummaryTouched) return;
    setProjectSummaryText(autoProjectSummary);
  }, [autoProjectSummary, projectSummaryTouched]);
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
      <div className="contract-frame-title">Contract</div>
      <div className="contract-frame-tagline">“Pride and Quality Make Decks Unique”</div>

      <div className="contract-frame-logoWrap">
        {/* If you have a logo file, update src path here */}
        {/* Example: src="/DU-logo.png" */}
        <img className="contract-frame-logo" src="/DU-logo.png" alt="Decks Unique" />
      </div>

      <div className="contract-frame-company">
        <div>119 Commack Road</div>
        <div>Commack, NY 11725</div>
        <div>631.266.3004 • 516.822.4008</div>
        <div>www.decksunique.com</div>
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
  <h2 className="contract-title">We hereby submit specification for:</h2>

  <div className="contract-linedBox">
    <textarea
      className="contract-linedTextarea"
      value={projectSummaryText}
      onChange={(e) => {
        setProjectSummaryTouched(true);
        setProjectSummaryText(e.target.value);
      }}
    />
  </div>
</section>

        <section className="contract-section">
         <h2 className="contract-section-title">Schedule & Pricing</h2>

          <div className="contract-formGrid no-print">
            <label className="contract-field">
              <div className="contract-fieldLabel">Deposit</div>
              <input
                className="contract-input"
                type="number"
                value={deposit}
                onChange={(e) => setDeposit(Number(e.target.value || 0))}
              />
            </label>

            <label className="contract-field">
              <div className="contract-fieldLabel">Price Override (optional)</div>
              <input
                className="contract-input"
                type="number"
                value={priceOverride}
                placeholder="leave blank to use estimate"
                onChange={(e) =>
                  setPriceOverride(e.target.value === "" ? "" : Number(e.target.value))
                }
              />
            </label>

            <label className="contract-field">
              <div className="contract-fieldLabel">Approx Start Date</div>
              <input
                className="contract-input"
                type="text"
                value={startDate}
                placeholder="e.g., March 10, 2026"
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>

            <label className="contract-field">
              <div className="contract-fieldLabel">Duration</div>
              <input
                className="contract-input"
                type="text"
                value={duration}
                placeholder="e.g., 3–5 days"
                onChange={(e) => setDuration(e.target.value)}
              />
            </label>
          </div>

          {/* Print-friendly summary */}
          <div className="contract-summary">
            <div className="contract-summaryRow">
              <span>Deposit</span>
              <strong>${(Number(deposit) || 0).toLocaleString()}</strong>
            </div>
            <div className="contract-summaryRow">
              <span>Total Contract Price</span>
              <strong>${(Number(contractPrice) || 0).toLocaleString()}</strong>
            </div>
            <div className="contract-summaryRow">
              <span>Approx Start Date</span>
              <strong>{startDate || "TBD"}</strong>
            </div>
            <div className="contract-summaryRow">
              <span>Duration</span>
              <strong>{duration || "TBD"}</strong>
            </div>
          </div>
        </section>

        <section className="contract-section">
         <h2 className="contract-section-title">Terms (editable later)</h2>
          <p className="contract-text">
            This contract is generated from the estimate selections. Final scope and
            specifications will match the approved proposal. Any changes requested by
            the client after signing may result in change orders and additional costs.
          </p>
          <p className="contract-text">
            Materials are ordered upon receipt of deposit. Client is responsible for
            providing access to the work area and any required HOA approvals.
          </p>
        </section>

        <section className="contract-section contract-sign">
          <div className="contract-signRow">
            <div className="contract-line">
              <div className="contract-lineLabel">Client Signature</div>
              <div className="contract-lineBar" />
            </div>
            <div className="contract-line small">
              <div className="contract-lineLabel">Date</div>
              <div className="contract-lineBar" />
            </div>
          </div>

          <div className="contract-signRow">
            <div className="contract-line">
              <div className="contract-lineLabel">Decks Unique Authorized Signature</div>
              <div className="contract-lineBar" />
            </div>
            <div className="contract-line small">
              <div className="contract-lineLabel">Date</div>
              <div className="contract-lineBar" />
            </div>
          </div>
        </section>

        <footer className="contract-foot">
          <div>Decks Unique • Contract generated by Estimator</div>
        </footer>
      </div>
    </div>
  );
}
