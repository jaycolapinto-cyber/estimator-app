// src/ContractPage.tsx
import React, { useMemo, useRef, useState } from "react";
import "./ContractPage.css";

type PricingItemRow = any;

type Props = {
  // Keep these loose so we don’t fight types while you’re building.
  finalEstimate: number;
  selectedDecking: any;
  selectedRailing: any;
  selectedStairOption: any;
  selectedFastener: any;
  selectedConstruction: any;
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

  const contractPrice = useMemo(() => {
    const base = Number(props.finalEstimate) || 0;
    const override = priceOverride === "" ? null : Number(priceOverride);
    return override != null && !Number.isNaN(override) ? override : base;
  }, [props.finalEstimate, priceOverride]);

  const clientName = useMemo(() => {
    const t = (props.clientTitle || "").trim();
    const ln = (props.clientLastName || "").trim();
    const combined = [t, ln].filter(Boolean).join(" ");
    return combined || "Client";
  }, [props.clientTitle, props.clientLastName]);

  const location = (props.clientLocation || "").trim();

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

        <header className="contract-head">
          <div className="contract-head-left">
            <div className="contract-label">Decks Unique</div>
            <div className="contract-sub">
              Contract Agreement (generated from estimate)
            </div>
          </div>

          <div className="contract-head-right">
            <div className="contract-metaRow">
              <span>Date</span>
              <strong>{new Date().toLocaleDateString()}</strong>
            </div>
            <div className="contract-metaRow">
              <span>Client</span>
              <strong>{clientName}</strong>
            </div>
            {location && (
              <div className="contract-metaRow">
                <span>Location</span>
                <strong>{location}</strong>
              </div>
            )}
          </div>
        </header>

        <section className="contract-section">
          <h2 className="contract-title">Project Summary</h2>

          <div className="contract-grid">
            <div className="contract-box">
              <div className="contract-boxTitle">Decking</div>
              <div className="contract-boxValue">
                {(props.selectedDecking?.name || "—").toString()}
              </div>
            </div>

            <div className="contract-box">
              <div className="contract-boxTitle">Railing</div>
              <div className="contract-boxValue">
                {(props.selectedRailing?.name || "—").toString()}
              </div>
            </div>

            <div className="contract-box">
              <div className="contract-boxTitle">Stairs</div>
              <div className="contract-boxValue">
                {(props.selectedStairOption?.name || "—").toString()}
              </div>
            </div>

            <div className="contract-box">
              <div className="contract-boxTitle">Fasteners</div>
              <div className="contract-boxValue">
                {(props.selectedFastener?.name || "—").toString()}
              </div>
            </div>

            <div className="contract-box">
              <div className="contract-boxTitle">Construction</div>
              <div className="contract-boxValue">
                {(props.selectedConstruction?.name || "—").toString()}
              </div>
            </div>
          </div>
        </section>

        <section className="contract-section">
          <h2 className="contract-title">Schedule & Pricing</h2>

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
          <h2 className="contract-title">Terms (editable later)</h2>
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
