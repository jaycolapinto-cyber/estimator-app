// src/ContractPage.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ContractPage.css";

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

const numberToWords = (num: number): string => {
  if (!Number.isFinite(num) || num <= 0) return "";
  const belowTwenty = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
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
  let words: string[] = [];
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
  const docRef = useRef<HTMLDivElement | null>(null);
  const HEADER_KEY = useMemo(() => {
    const id = (props.estimateId || "").trim();
    return id ? `du_contract_header::${id}` : "du_contract_header::default";
  }, [props.estimateId]);

  const SPEC_KEY = useMemo(() => {
    const id = (props.estimateId || "").trim();
    return id ? `du_contract_spec::${id}` : "du_contract_spec::default";
  }, [props.estimateId]);
  // Editable fields
  const [deposit, setDeposit] = useState<number>(1000);
  const [priceOverride, setPriceOverride] = useState<number | "">("");
  const [startDate, setStartDate] = useState<string>("");
  const [duration, setDuration] = useState<string>("");

  // Payment Terms (editable)
  const [paymentScheduleText, setPaymentScheduleText] = useState<string>(
    "$1,000 deposit with contract. Balance upon completion."
  );
  const [contractSumWords, setContractSumWords] = useState<string>("");
  const [contractSumNumerals, setContractSumNumerals] = useState<string>("");
  const [contractSumTouched, setContractSumTouched] = useState<boolean>(false);
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

  // Capital Improvement (ST-124)
  const [includeCapitalImprovement, setIncludeCapitalImprovement] = useState<boolean>(false);
  const [ciDescription, setCiDescription] = useState<string>("Build new deck and railings.");
  const [ciProjectName, setCiProjectName] = useState<string>("");
  const [ciWorkAddress, setCiWorkAddress] = useState<string>("");
  const [ciCity, setCiCity] = useState<string>("");
  const [ciState, setCiState] = useState<string>("");
  const [ciZip, setCiZip] = useState<string>("");

  // Body
  const [specificationText, setSpecificationText] = useState<string>("");
  const [specificationTouched, setSpecificationTouched] = useState<boolean>(false);
  const specHasSavedRef = useRef<boolean>(false);

// ✅ Per-estimate persistence (keyed by estimateId)
// Load when switching files
useEffect(() => {
  try {
    const raw = localStorage.getItem(HEADER_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      setHdrClient(saved?.hdrClient || "");
      setHdrAddress(saved?.hdrAddress || "");
      setHdrPhone(saved?.hdrPhone || "");
      setHdrDate(saved?.hdrDate || new Date().toLocaleDateString());
      setHdrPageNum(saved?.hdrPageNum || "1");
      setHdrPageOf(saved?.hdrPageOf || "1");
      setHdrApproxStart(saved?.hdrApproxStart || "");
      setHdrApproxEnd(saved?.hdrApproxEnd || "");
      setHdrEssence(saved?.hdrEssence || "not");
    }
  } catch {}
}, [HEADER_KEY]);

useEffect(() => {
  try {
    const raw = localStorage.getItem(SPEC_KEY) || "";
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved?.text !== undefined) {
        setSpecificationText(saved.text || "");
        // If there's any saved text, treat as touched to prevent auto-overwrite
        const hasSaved = !!saved.text;
        specHasSavedRef.current = hasSaved;
        setSpecificationTouched(!!saved.touched || hasSaved);
      }
    }
  } catch {}
}, [SPEC_KEY]);

// Auto-fill CI form from header (lightweight)
useEffect(() => {
  if (hdrClient) {
    // no state change needed; uses hdrClient directly in render
  }
  if (!ciWorkAddress && hdrAddress) {
    setCiWorkAddress(hdrAddress);
  }
}, [hdrClient, hdrAddress]);

// Save on change
useEffect(() => {
  if (!HEADER_KEY) return;
  try {
    localStorage.setItem(
      HEADER_KEY,
      JSON.stringify({
        hdrClient,
        hdrAddress,
        hdrPhone,
        hdrDate,
        hdrPageNum,
        hdrPageOf,
        hdrApproxStart,
        hdrApproxEnd,
        hdrEssence,
      })
    );
  } catch {}
}, [
  HEADER_KEY,
  hdrClient,
  hdrAddress,
  hdrPhone,
  hdrDate,
  hdrPageNum,
  hdrPageOf,
  hdrApproxStart,
  hdrApproxEnd,
  hdrEssence,
]);

const persistSpecification = useCallback(
  (text: string, touched: boolean) => {
    if (!SPEC_KEY) return;
    try {
      localStorage.setItem(
        SPEC_KEY,
        JSON.stringify({ text: text || "", touched })
      );
    } catch {}
  },
  [SPEC_KEY]
);

useEffect(() => {
  persistSpecification(specificationText, specificationTouched);
}, [persistSpecification, specificationText, specificationTouched]);

  const contractPrice = useMemo(() => {
    const base = Number(props.finalEstimate) || 0;
    const override = priceOverride === "" ? null : Number(priceOverride);
    return override != null && !Number.isNaN(override) ? override : base;
  }, [props.finalEstimate, priceOverride]);

  useEffect(() => {
    if (contractSumTouched) return;
    if (!Number.isFinite(contractPrice) || contractPrice <= 0) return;
    const whole = Math.round(contractPrice);
    setContractSumNumerals(whole.toLocaleString("en-US"));
    setContractSumWords(numberToWords(whole));
  }, [contractPrice, contractSumTouched]);

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

  const autoSpecification = useMemo(() => {
    const lines: string[] = [];

    const add = (s?: string | null) => {
      const t = (s || "").trim();
      if (t) lines.push(t);
    };

    add(
      "New deck will be built as per the sketch plans and 3D renderings that will be emailed prior for approval."
    );

    const demoName = (props.demoType || "").trim();
    const demoBlurb = (props.demoDescription || "").trim();
    if (demoBlurb) add(`Demolition: ${demoBlurb}`);
    else if (demoName) add(`Demolition: ${demoName}.`);

    const deckingName = (props.selectedDecking?.name || props.selectedDecking?.label || "").trim();
    const fastenerName = (props.selectedFastener?.name || props.selectedFastener?.label || "").trim();
    if (deckingName && fastenerName) {
      add(
        `${companyName} will supply and install ${deckingName} secured with ${fastenerName}. Decking color to be selected (TBD).`
      );
    } else if (deckingName) {
      add(`${companyName} will supply and install ${deckingName}. Decking color to be selected (TBD).`);
    }

    const railingName = (props.selectedRailing?.name || props.selectedRailing?.label || "").trim();
    if (railingName) {
      add(`${companyName} will supply and install ${railingName} railing system. Railing color to be selected (TBD).`);
    }

    const stairName = (props.selectedStairOption?.name || props.selectedStairOption?.label || "").trim();
    const stairBlurb = (props.selectedStairOption?.proposal_description || "").trim();
    if (stairBlurb) add(`Stairs: ${stairBlurb}`);
    else if (stairName) add(`${companyName} will supply and install ${stairName}.`);

    const skirtingName = (props.selectedSkirting?.name || props.selectedSkirting?.label || "").trim();
    const skirtingBlurb = (props.selectedSkirting?.proposal_description || "").trim();
    if (skirtingBlurb) add(`Skirting: ${skirtingBlurb}`);
    else if (skirtingName) add(`${companyName} will supply and install ${skirtingName}.`);

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

    return Array.from(new Set(lines)).join("\n");
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

  useEffect(() => {
    if (specificationTouched) return;
    if (specHasSavedRef.current) return;
    setSpecificationText(autoSpecification);
  }, [autoSpecification, specificationTouched]);

  // Guard: if user text exists, lock as touched (prevents re-seeding)
  useEffect(() => {
    if (specificationText && !specificationTouched) {
      setSpecificationTouched(true);
    }
  }, [specificationText, specificationTouched]);


  const printContract = () => window.print();

  return (
    <div className="contract-page">
      <div className="contract-actions no-print">
        <button className="du-btn" onClick={printContract}>
          Print Contract
        </button>
        <label className="contract-ci-toggle">
          <input
            type="checkbox"
            checked={includeCapitalImprovement}
            onChange={(e) => setIncludeCapitalImprovement(e.target.checked)}
          />
          <span>Include Capital Improvement (ST‑124)</span>
        </label>
      </div>

      {includeCapitalImprovement && (
        <div className="ci-edit no-print">
          <div className="ci-edit-title">Capital Improvement (ST‑124) Details</div>
          <div className="ci-edit-grid">
            <label>
              Project name
              <input value={ciProjectName} onChange={(e) => setCiProjectName(e.target.value)} />
            </label>
            <label>
              Work address
              <input value={ciWorkAddress} onChange={(e) => setCiWorkAddress(e.target.value)} />
            </label>
            <label>
              City
              <input value={ciCity} onChange={(e) => setCiCity(e.target.value)} />
            </label>
            <label>
              State
              <input value={ciState} onChange={(e) => setCiState(e.target.value)} />
            </label>
            <label>
              ZIP
              <input value={ciZip} onChange={(e) => setCiZip(e.target.value)} />
            </label>
          </div>
          <label className="ci-edit-desc">
            Description
            <textarea value={ciDescription} onChange={(e) => setCiDescription(e.target.value)} rows={2} />
          </label>
        </div>
      )}

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
            {/* Specifications */}
            <div className="contract-section">
              <h2>We hereby submit specification for:</h2>

              <textarea
                id="contract-specification"
                name="contractSpecification"
                className="contract-textarea no-print"
                value={specificationText}
                onChange={(e) => {
                  const next = e.target.value;
                  setSpecificationTouched(true);
                  setSpecificationText(next);
                  persistSpecification(next, true);
                }}
                rows={10}
                placeholder="Specifications will auto‑populate here. You can edit each line."
                spellCheck={true}
                autoCorrect="on"
                autoCapitalize="sentences"
                autoComplete="on"
                lang="en"
              />

              <ul className="contract-scopeList print-only">
                {specificationText
                  .split("\n")
                  .filter((line) => line.trim() !== "")
                  .map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
              </ul>
            </div>

       {/* Bottom stack: Payment + Legal + Acceptance + Cancellation + Licenses */}
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
            setContractSumTouched(true);
            const raw = e.target.value.replace(/[^\d]/g, "");
            const num = raw ? Number(raw) : 0;
            const formatted = raw ? num.toLocaleString("en-US") : "";
            setContractSumNumerals(formatted);
            setContractSumWords(numberToWords(num));
          }}
          placeholder="25,500"
          inputMode="decimal"
        />
      </div>
      <div className="contract-sumPrint print-only">${contractSumNumerals || ""}</div>
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

    {/* Legal print */}
    <div className="contract-legalText print-only" style={{ whiteSpace: "pre-wrap" }}>
      {legalDisclaimerText}
    </div>
  </section>

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

  <footer className="contract-foot">
    <span>Nassau H18607600</span>
    <span>Suffolk 1614-H</span>
  </footer>

  {/* Capital Improvement Form (ST-124) */}
  {includeCapitalImprovement && (
    <section className="contract-ci">
      <div className="ci-title">New York State and Local Sales and Use Tax — Certificate of Capital Improvement (ST‑124)</div>

      <div className="ci-grid">
        <div className="ci-box">
          <div className="ci-label">Name of contractor (print or type)</div>
          <div className="ci-value">Decks Unique</div>
          <div className="ci-label">Address (number and street)</div>
          <div className="ci-value">119 Commack Road</div>
          <div className="ci-row">
            <div>
              <div className="ci-label">City</div>
              <div className="ci-value">Commack</div>
            </div>
            <div>
              <div className="ci-label">State</div>
              <div className="ci-value">NY</div>
            </div>
            <div>
              <div className="ci-label">ZIP code</div>
              <div className="ci-value">11725</div>
            </div>
          </div>
        </div>

        <div className="ci-box">
          <div className="ci-label">Name of customer (print or type)</div>
          <div className="ci-value">{hdrClient || ""}</div>
          <div className="ci-label">Address (number and street)</div>
          <div className="ci-value">{hdrAddress || ""}</div>
          <div className="ci-row">
            <div>
              <div className="ci-label">City</div>
              <div className="ci-value">{ciCity}</div>
            </div>
            <div>
              <div className="ci-label">State</div>
              <div className="ci-value">{ciState}</div>
            </div>
            <div>
              <div className="ci-label">ZIP code</div>
              <div className="ci-value">{ciZip}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="ci-section">
        <div className="ci-label">Describe capital improvement to be performed</div>
        <div className="ci-value">{ciDescription}</div>
      </div>

      <div className="ci-grid">
        <div className="ci-box">
          <div className="ci-label">Project name</div>
          <div className="ci-value">{ciProjectName}</div>
        </div>
        <div className="ci-box">
          <div className="ci-label">Street address (where the work is to be performed)</div>
          <div className="ci-value">{ciWorkAddress}</div>
          <div className="ci-row">
            <div>
              <div className="ci-label">City</div>
              <div className="ci-value">{ciCity}</div>
            </div>
            <div>
              <div className="ci-label">State</div>
              <div className="ci-value">{ciState}</div>
            </div>
            <div>
              <div className="ci-label">ZIP code</div>
              <div className="ci-value">{ciZip}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="ci-sign">
        <div className="ci-sign-row">
          <div className="ci-sign-line" />
          <div className="ci-sign-label">Signature of customer</div>
        </div>
        <div className="ci-sign-row">
          <div className="ci-sign-line" />
          <div className="ci-sign-label">Signature of contractor or officer</div>
        </div>
      </div>
    </section>
  )}
</div>

</section>
        </div>
      </div>
    </div>
  );
}