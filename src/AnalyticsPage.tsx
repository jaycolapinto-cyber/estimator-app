import React from "react";
import "./analytics.css";

export default function AnalyticsPage() {
  return (
    <div className="an-wrap">
      <div className="an-header">
        <div>
          <div className="an-title">Analytics</div>
          <div className="an-subtitle">
            Quick stats for estimates and pricing usage (admin view)
          </div>
        </div>

        <div className="an-actions">
          <button className="an-btn">Refresh</button>
        </div>
      </div>

      <div className="an-grid">
        <div className="an-card">
          <div className="an-kicker">Estimates</div>
          <div className="an-big">—</div>
          <div className="an-muted">Coming soon</div>
        </div>

        <div className="an-card">
          <div className="an-kicker">Avg. Project Size</div>
          <div className="an-big">—</div>
          <div className="an-muted">Coming soon</div>
        </div>

        <div className="an-card">
          <div className="an-kicker">Avg. Price / SF</div>
          <div className="an-big">—</div>
          <div className="an-muted">Coming soon</div>
        </div>

        <div className="an-card">
          <div className="an-kicker">Uplifts Used</div>
          <div className="an-big">—</div>
          <div className="an-muted">Coming soon</div>
        </div>
      </div>

      <div className="an-panel">
        <div className="an-panel-title">Notes</div>
        <div className="an-panel-body">
          This page is intentionally lightweight. Next step is to pull saved
          estimates (localStorage or Supabase) and aggregate totals by category,
          construction type, decking, and uplift usage.
        </div>
      </div>
    </div>
  );
}
