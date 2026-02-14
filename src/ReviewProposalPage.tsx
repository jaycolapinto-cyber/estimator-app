import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import ProposalPage from "./ProposalPage";

export default function ReviewProposalPage() {
  const raw = window.location.pathname.split("/review/")[1] || "";
  const id = decodeURIComponent(raw).split(/[?#]/)[0].replace(/\/+$/, "").trim();

  const [proposalData, setProposalData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        if (!id) {
          setLoadError("Missing proposal id in URL.");
          setProposalData(null);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from("proposals")
          .select("data, org_id")
          .eq("id", id)
          .single();

        if (!alive) return;

        if (error) {
          console.error("Failed to load proposal:", { id, error });
          setLoadError(error.message || "Failed to load proposal.");
          setProposalData(null);
          setLoading(false);
          return;
        }

        const proposal = data?.data || {};
        const orgId = data?.org_id ?? proposal?.orgId ?? null;

        // Load org settings (if public read allowed)
        let settings: any = null;
        if (orgId) {
          const { data: s } = await supabase
            .from("user_settings")
            .select("*")
            .eq("org_id", orgId)
            .single();
          settings = s || null;
        }

        // ✅ IMPORTANT:
        // Public review should render from the snapshot stored inside proposals.data.
        // So we DO NOT fetch proposal_sections here (RLS will often block it).
        setProposalData({
          ...proposal,
          orgId,
          userSettings: settings ?? proposal?.userSettings ?? null,
          proposalSectionsSnapshot: proposal?.proposalSectionsSnapshot ?? null,
          proposalLayoutOrder: proposal?.proposalLayoutOrder ?? null,
          proposalNotesSnapshot: proposal?.proposalNotesSnapshot ?? null,
          sowModeSnapshot: proposal?.sowModeSnapshot ?? null,
          sowCustomTextSnapshot: proposal?.sowCustomTextSnapshot ?? null,
          startWeeksSnapshot: proposal?.startWeeksSnapshot ?? null,
          durationDaysSnapshot: proposal?.durationDaysSnapshot ?? null,
          showLineItemPricesSnapshot: proposal?.showLineItemPricesSnapshot ?? null,
        });

        setLoadError(null);
        setLoading(false);
      } catch (e: any) {
        console.error("ReviewProposalPage fatal error:", e);
        setLoadError(e?.message || "Unexpected error.");
        setProposalData(null);
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) return <div style={{ padding: 40 }}>Loading proposal…</div>;

  if (!proposalData) {
    return (
      <div style={{ padding: 40 }}>
        <div>Proposal not found.</div>
        {loadError ? (
          <pre style={{ marginTop: 12, padding: 12, background: "#f6f6f6" }}>
            {loadError}
          </pre>
        ) : null}
      </div>
    );
  }

  return <ProposalPage {...proposalData} readOnly />;
}
