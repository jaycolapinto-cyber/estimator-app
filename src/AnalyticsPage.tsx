import React, { useMemo } from "react";
import "./analytics.css";

type AddItemRow = {
  picked?: any;
  lineBase?: number | null;
};

export type AnalyticsPageProps = {
  finalEstimate: number;

  // percents
  permitPercent?: number;
  smallJobPercent?: number;
  perceivedPercent?: number;
  financePercent?: number;
  miPercent?: number;

  // subtotals to compute base
  deckingSubtotal?: number;
  railingSubtotal?: number;
  stairsSubtotal?: number;
  fastenerSubtotal?: number;
  demoSubtotal?: number;
  skirtingSubtotal?: number;
  addItemsDetailed?: AddItemRow[];
};

const money0 = (n: number) =>
  (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

const pct0 = (n: number) => `${Math.round(Number(n) || 0)}%`;

export default function AnalyticsPage({
  finalEstimate,

  permitPercent = 0,
  smallJobPercent = 0,
  perceivedPercent = 0,
  financePercent = 0,
  miPercent = 0,

  deckingSubtotal = 0,
  railingSubtotal = 0,
  stairsSubtotal = 0,
  fastenerSubtotal = 0,
  demoSubtotal = 0,
  skirtingSubtotal = 0,
  addItemsDetailed = [],
}: AnalyticsPageProps) {
  const breakdown = useMemo(() => {
    // Base price = sum of all line items BEFORE any uplifts
    const addItemsBase = (addItemsDetailed as any[])
      .filter((r) => r?.picked && Number(r?.lineBase || 0) !== 0)
      .reduce((sum, r) => sum + (Number(r?.lineBase) || 0), 0);

    const basePrice =
      (Number(deckingSubtotal) || 0) +
      (Number(railingSubtotal) || 0) +
      (Number(stairsSubtotal) || 0) +
      (Number(fastenerSubtotal) || 0) +
      (Number(demoSubtotal) || 0) +
      (Number(skirtingSubtotal) || 0) +
      addItemsBase;

    // ✅ RULE: ALL uplifts are calculated from BASE PRICE
    const permitAmt = Math.round((basePrice * (Number(permitPercent) || 0)) / 100);
    const smallJobAmt = Math.round(
      (basePrice * (Number(smallJobPercent) || 0)) / 100
    );

    const perceivedAmt = Math.round(
      (basePrice * (Number(perceivedPercent) || 0)) / 100
    );
    const financeAmt = Math.round(
      (basePrice * (Number(financePercent) || 0)) / 100
    );

    // Target total from app
    const final = Math.round(Number(finalEstimate) || 0);

    // Base + permit + small job
    const msrp = Math.round(basePrice + permitAmt + smallJobAmt);

    // Force MI to be remainder so rows always sum EXACTLY to Final Estimate
    let miAmt = final - basePrice - permitAmt - smallJobAmt - perceivedAmt - financeAmt;
    if (!Number.isFinite(miAmt)) miAmt = 0;

    const computedFromRows =
      basePrice + permitAmt + smallJobAmt + perceivedAmt + financeAmt + miAmt;

    return {
      basePrice,
      permitAmt,
      smallJobAmt,
      msrp, // still shown as "Base + Permit + Small Job"
      perceivedAmt,
      financeAmt,
      miAmt,
      final,
      computedFromRows,
    };
  }, [
    finalEstimate,
    deckingSubtotal,
    railingSubtotal,
    stairsSubtotal,
    fastenerSubtotal,
    demoSubtotal,
    skirtingSubtotal,
    addItemsDetailed,
    permitPercent,
    smallJobPercent,
    perceivedPercent,
    financePercent,
    miPercent,
  ]);

  return (
    <div className="an-wrap">
      <div className="an-top">
        <div>
          <div className="an-title">Estimate Analytics</div>
          <div className="an-subtitle">
            Admin view — live breakdown of the current estimate total
          </div>
        </div>

        <div className="an-actions">
          <button
            className="an-btn"
            onClick={() => window.dispatchEvent(new Event("resize"))}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="an-grid an-grid--3">
        <div className="an-card an-card--kpi">
          <div className="an-kicker">Final Estimate (App)</div>
          <div className="an-big">${money0(breakdown.final)}</div>
          <div className="an-muted">What the customer sees</div>
        </div>

        <div className="an-card an-card--kpi">
          <div className="an-kicker">MSRP</div>
          <div className="an-big">${money0(breakdown.msrp)}</div>
          <div className="an-muted">Base + Permit + Small Job</div>
        </div>

        <div className="an-card an-card--kpi">
          <div className="an-kicker">Base Price</div>
          <div className="an-big">${money0(breakdown.basePrice)}</div>
          <div className="an-muted">Before any uplifts</div>
        </div>
      </div>

      <div className="an-card an-card--panel">
        <div className="an-panel-head">
          <div>
            <div className="an-panel-title">Uplift Breakdown</div>
            <div className="an-panel-subtitle">
              All uplifts are % of Base Price (and totals always match Final Estimate)
            </div>
          </div>
        </div>

        <div className="an-sections">
          <div className="an-section">
            <div className="an-section-title">MSRP</div>
            <div className="an-section-subtitle">Base + required uplifts</div>

            <div className="an-rows">
              <Row label="Base Price" value={`$${money0(breakdown.basePrice)}`} strong />
              <Row
                label={`Permit (${pct0(permitPercent)})`}
                value={`$${money0(breakdown.permitAmt)}`}
              />
              <Row
                label={`Small Job (${pct0(smallJobPercent)})`}
                value={`$${money0(breakdown.smallJobAmt)}`}
              />

              <Divider />

              <Row label="MSRP" value={`$${money0(breakdown.msrp)}`} strong />
            </div>
          </div>

          <div className="an-section">
            <div className="an-section-title">Final Estimate</div>
            <div className="an-section-subtitle">Business uplifts (all based on Base)</div>

            <div className="an-rows">
              <Row
                label={`Perceived Value (${pct0(perceivedPercent)})`}
                value={`$${money0(breakdown.perceivedAmt)}`}
              />
              <Row
                label={`Finance (${pct0(financePercent)})`}
                value={`$${money0(breakdown.financeAmt)}`}
              />
              <Row
                label={`Manual Index (${pct0(miPercent)})`}
                value={`$${money0(breakdown.miAmt)}`}
              />

              <Divider />

              <Row
                label="Final Estimate"
                value={`$${money0(breakdown.final)}`}
                strong
              />
            </div>
          </div>

          <div className="an-section an-section--note">
            <div className="an-section-title">Notes</div>
            <div className="an-note">
              This page is “live” for the current estimate. Later we can add saved-estimate
              history (Supabase) and show averages by material, construction type, and uplift usage.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={"an-row " + (strong ? "an-row--strong" : "")}>
      <div className="an-row__label">{label}</div>
      <div className="an-row__value">{value}</div>
    </div>
  );
}

function Divider() {
  return <div className="an-divider" />;
}
