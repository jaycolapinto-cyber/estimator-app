import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import ProposalPage from "./ProposalPage";

export default function ReviewProposalPage() {
  const raw = window.location.pathname.split("/review/")[1] || "";
  const id = decodeURIComponent(raw)
    .split(/[?#]/)[0]
    .replace(/\/+$/, "")
    .trim();

  const [proposalData, setProposalData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    supabase
      .from("proposals")
      .select("data, org_id")
      .eq("id", id)
      .single()
      .then(async ({ data, error }: { data: any; error: any }) => {
        if (error) {
          console.error("Failed to load proposal:", { id, error });
          setProposalData(null);
        } else {
          const proposal = data?.data || {};
          const orgId = data?.org_id ?? null;

          // fetch settings for that org (public-safe read)
          let settings: any = null;
          if (orgId) {
            const { data: s } = await supabase
              .from("user_settings")
              .select("*")
              .eq("org_id", orgId)
              .single();
            settings = s || null;
          }

          setProposalData({
            ...proposal,
            orgId,
            userSettings: settings,
          });
        }
        setLoading(false);
      });
  }, [id]);

  if (loading) return <div style={{ padding: 40 }}>Loading proposal…</div>;
  if (!proposalData)
    return <div style={{ padding: 40 }}>Proposal not found.</div>;

  return <ProposalPage {...proposalData} readOnly />;
}
