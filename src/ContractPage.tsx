// src/ContractPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./ContractPage.css";
import { supabase } from "./supabaseClient";

type PricingItemRow = any;

type Props = {
    estimateId: string;
  orgId: string | null;
  finalEstimate: number;
  selectedDecking: any;
  selectedRailing: any;
  selectedStairOption: any;
  selectedFastener: any;
  selectedConstruction: any;
  selectedDemo?: any;
  constructionKey?: string;
  constructionType?: string;
  clientTitle?: string;
  selectedSkirting?: any;
  clientLastName?: string;
  clientLocation?: string;
  clientEmail?: string;
  demoType?: string | null;
  demoDescription?: string | null;
  addItemsDetailed?: any;
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
    "$1,000 deposit with contract. Balance upon completion."
  );
  const [contractSumWords, setContractSumWords] = useState<string>("");
  const [contractSumNumerals, setContractSumNumerals] = useState<string>("");
  const [legalDisclaimerText, setLegalDisclaimerText] = useState<string>(
    "All material is guaranteed to be specified. All work to be completed in a work-manlike manner according to standard practices.\n\nThe buyer is responsible for all permits and C.O.’s unless otherwise specified. Decks Unique Inc. is not responsible for weathering, shrinkage or growth on materials, or any underground utilities that may be damaged.\n\nAll agreements contingent upon strikes, accidents or delays beyond our control. There will be a labor charge for any warrantee claim.\n\nIn the event of any litigation to enforce the terms of this contract the successful party will reimburse the other party for all costs, including reasonable attorney fees."
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

  // Body
  const [constructionScopeText, setConstructionScopeText] = useState<string>("");
  const [projectSummaryText, setProjectSummaryText] = useState<string>("");
  const [scopeOfWorkText, setScopeOfWorkText] = useState<string>("");
  const [projectSummaryTouched, setProjectSummaryTouched] = useState<boolean>(false);
  const [scopeTouched, setScopeTouched] = useState<boolean>(false);
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
        return ((obj?.organizationName || obj?.orgName || obj?.companyName || "") as string).trim();
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

    pushLine(
      "New deck will be built as per the sketch plans and 3D renderings that will be emailed prior for approval."
    );

    const demoName = (props.demoType || "").trim();
    const demoBlurb = (props.demoDescription || "").trim();
    if (demoBlurb) pushLine(`Demolition: ${demoBlurb}`);
    else if (demoName) pushLine(`Demolition: ${demoName}.`);

    const deckingName = (props.selectedDecking?.name || props.selectedDecking?.label || "").trim();
    const fastenerName = (props.selectedFastener?.name || props.selectedFastener?.label || "").trim();
    if (deckingName && fastenerName) {
      pushLine(
        `${companyName} will supply and install ${deckingName} secured with ${fastenerName}. Decking color to be selected (TBD).`
      );
    } else if (deckingName) {
      pushLine(`${companyName} will supply and install ${deckingName}. Decking color to be selected (TBD).`);
    }

    const railingName = (props.selectedRailing?.name || props.selectedRailing?.label || "").trim();
    if (railingName) {
      pushLine(`${companyName} will supply and install ${railingName} railing system. Railing color to be selected (TBD).`);
    }

    const stairName = (props.selectedStairOption?.name || props.selectedStairOption?.label || "").trim();
    const stairBlurb = (props.selectedStairOption?.proposal_description || "").trim();
    if (stairBlurb) pushLine(`Stairs: ${stairBlurb}`);
    else if (stairName) pushLine(`${companyName} will supply and install ${stairName}.`);

    const skirtingName = (props.selectedSkirting?.name || props.selectedSkirting?.label || "").trim();
    const skirtingBlurb = (props.selectedSkirting?.proposal_description || "").trim();
    if (skirtingBlurb) pushLine(`Skirting: ${skirtingBlurb}`);
    else if (skirtingName) pushLine(`${companyName} will supply and install ${skirtingName}.`);

    return lines.join("\n");
  }, [
    props.demoType,
    props.demoDescription,
    props.selectedDecking,
    props.selectedFastener,
    props.selectedRailing,
    props.selectedStairOption,
    props.selectedSkirting,
    companyName,
  ]);
  const autoScopeOfWork = useMemo(() => {
    const lines: string[] = [];

    const add = (s?: string | null) => {
      const t = (s || "").trim();
      if (t) lines.push(t);
    };

    // Basic scope defaults (safe + generic)
    add("Furnish and install all materials and labor per approved plans.");
    add("Layout and build structure per code and manufacturer specifications.");

    // Pull from estimator selections when available
    const decking = (props.selectedDecking?.name || props.selectedDecking?.label || "").trim();
    const railing = (props.selectedRailing?.name || props.selectedRailing?.label || "").trim();
    const stairs = (props.selectedStairOption?.name || props.selectedStairOption?.label || "").trim();
    const fasteners = (props.selectedFastener?.name || props.selectedFastener?.label || "").trim();
    const skirting = (props.selectedSkirting?.name || props.selectedSkirting?.label || "").trim();
    const demo = (props.demoType || "").trim();

    if (demo) add(`Demolition: ${demo}.`);
   if (decking) add(`Install ${decking} decking (color to be selected).`);
if (fasteners) add(`Secure decking using ${fasteners} per manufacturer requirements.`);
if (railing) add(`Install ${railing} railing system (color to be selected).`);
if (stairs) add(`Build and install ${stairs} per code and manufacturer specifications.`);
if (skirting) add(`Install ${skirting} skirting as specified.`);
    return lines.join("\n");
  }, [
    props.selectedDecking,
    props.selectedRailing,
    props.selectedStairOption,
    props.selectedFastener,
    props.selectedSkirting,
    props.demoType,
  ]);
  useEffect(() => {
    if (projectSummaryTouched) return;
    setProjectSummaryText(autoProjectSummary);
  }, [autoProjectSummary, projectSummaryTouched]);
  useEffect(() => {
    if (scopeTouched) return;
    setScopeOfWorkText(autoScopeOfWork);
  }, [autoScopeOfWork, scopeTouched]);
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

  // Persist project summary when user edits it
  useEffect(() => {
    try {
      if (projectSummaryTouched) {
        localStorage.setItem(PROJECT_SUMMARY_KEY, projectSummaryText || "");
      }
    } catch {
      // ignore
    }
  }, [projectSummaryText, projectSummaryTouched, PROJECT_SUMMARY_KEY]);

  // Persist project summary when user edits it
  useEffect(() => {
    try {
      if (projectSummaryTouched) {
        localStorage.setItem(PROJECT_SUMMARY_KEY, projectSummaryText || "");
      }
    } catch {
      // ignore
    }
  }, [projectSummaryText, projectSummaryTouched, PROJECT_SUMMARY_KEY]);

  useEffect(() => {
    const key = (props.constructionKey || "").trim();
    if (!key) {
      setConstructionScopeText("");
      return;
    }

    let cancelled = false;

    (async () => {
      let { data, error } = await supabase
        .from("sow_templates")
        .select("body")
        .eq("label", key)
        .maybeSingle();

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

  const printContract = () => window.print();

  return (
    <div className="contract-page">
      <div className="contract-actions no-print">
        <button className="du-btn" onClick={printContract}>
          Print Contract
        </button>
      </div>

      <div id="contract-doc" className="contract-doc" ref={docRef}>
        <div className="contract-container">
          <header className="contract-header">
            <div className="contract-header-inner">
              {/* LEFT */}
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

              {/* CENTER */}
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

              {/* RIGHT */}
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
                      aria-label="Approximate start date"
                    />
                  </div>

                  <div className="contract-inlineRow">
                    <span className="contract-inlineLabel">Approximate End Date</span>
                    <input
                      className="contract-inlineInput"
                      value={hdrApproxEnd}
                      onChange={(e) => setHdrApproxEnd(e.target.value)}
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

          {/* ✅ Contract body */}
          <section className="contract-body">
            {/* Project Summary */}
            <div className="contract-sectionCard">
              <div className="contract-sectionTitle">Project Summary</div>

              <textarea
                className="contract-textarea no-print"
                value={constructionScopeText || ""}
                onChange={(e) => setConstructionScopeText(e.target.value)}
                placeholder="Auto-filled from Construction Type template. You can edit this for the contract."
                rows={6}
              />

              <div className="contract-paragraph print-only">{constructionScopeText}</div>
            </div>

            {/* Scope of Work */}
            <div className="contract-section">
              <h2>Scope of Work</h2>

              <textarea
                className="contract-textarea no-print"
                value={scopeOfWorkText}
                onChange={(e) => {
                  setScopeTouched(true);
                  setScopeOfWorkText(e.target.value);
                }}
                rows={8}
                placeholder="Enter scope of work. One item per line."
              />

              <ul className="contract-scopeList print-only">
                {scopeOfWorkText
                  .split("\n")
                  .filter((line) => line.trim() !== "")
                  .map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
              </ul>
            </div>

       {/* Bottom stack: Payment + Legal + Acceptance (tight grouping) */}
<div className="contract-bottom-stack">
  {/* Sum of + Amount + Payment Schedule */}
  <section className="contract-section contract-section--sum">
    <h2>
      We propose to hereby to furnish material and labor – complete in accordance with the above specifications, for the sum of:
    </h2>

    <div className="contract-sumRow">
      <div className="contract-sumWords">
        <div className="contract-sumLine">
          {contractSumWords ? `${contractSumWords} USD 00/100` : "\u00A0"}
        </div>
      </div>

      <div className="contract-sumInputWrap">
        <label className="contract-sumLabel">($)</label>
        <input
          className="contract-sumInput"
          value={contractSumNumerals}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d]/g, "");
            const formatted = raw ? Number(raw).toLocaleString("en-US") : "";
            setContractSumNumerals(formatted);
          }}
          placeholder="25,500"
          inputMode="decimal"
        />
      </div>
    </div>

    <div className="contract-payRow">
      <div className="contract-payLabel">PAYMENT SCHEDULE:</div>

      {/* ON SCREEN */}
      <textarea
        className="contract-payValue no-print"
        value={paymentScheduleText}
        onChange={(e) => setPaymentScheduleText(e.target.value)}
        rows={1}
        placeholder="$1,000 deposit with contract. Balance upon completion."
      />

      {/* PRINT */}
      <div className="contract-payValue print-only" style={{ whiteSpace: "pre-wrap" }}>
        {paymentScheduleText}
      </div>
    </div>

    {/* Legal (editable) */}
    <textarea
      className="contract-legalTextarea no-print"
      value={legalDisclaimerText}
      onChange={(e) =>
        setLegalDisclaimerText(e.target.value.replace(/\n\s*\n/g, "\n"))
      }
    />

    {/* Print rendering (no scrollbars, true text layout) */}
    <div className="contract-linedPrint print-only">
      {projectSummaryText}
    </div>
  </section>
</div>

{/* Acceptance */}
<section className="contract-section contract-acceptance">
  <h2>Acceptance of Proposal</h2>

  <div className="acceptance-grid">
    {/* LEFT: Client */}
    <div className="acceptance-party">
      <div className="sig-row">
        <div className="sig-col">
          <div className="sig-line" />
          <div className="sig-label">Client Signature</div>
        </div>

        <div className="sig-col sig-col-date">
          <div className="sig-line" />
          <div className="sig-label">Date</div>
        </div>
      </div>
    </div>

    {/* subtle divider */}
    <div className="acceptance-divider" aria-hidden="true" />

    {/* RIGHT: Authorized */}
    <div className="acceptance-party">
      <div className="sig-row">
        <div className="sig-col">
          <div className="sig-line" />
          <div className="sig-label">Authorized Signature</div>
        </div>

        <div className="sig-col sig-col-date">
          <div className="sig-line" />
          <div className="sig-label">Date</div>
        </div>
      </div>
    </div>
  </div>
</section>

{/* Cancellation Policy */}
<section className="contract-cancellation">
  <h4 className="contract-cancellation-title">Notice of Cancellation</h4>

  <p className="contract-cancellation-text">
    You, the buyer, may cancel this transaction at any time prior to midnight of the third
    business day after the date of this transaction. See the attached Notice of Cancellation
    form for an explanation of this right.
  </p>
</section>

</section>

<footer className="contract-foot">
  <span>Nassau H18607600</span> <span>Suffolk 1614-H</span>
</footer> 
        </div>
      </div>
    </div>
  );
}