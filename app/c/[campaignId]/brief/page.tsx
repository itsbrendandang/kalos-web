import { BriefTab } from "@/components/workspace/brief/brief-tab";

// Brief tab (/c/[campaignId]/brief). The campaign's retrospective: the
// full-detail campaign history, the run cadence, and what the latest analysis
// learned. Body content lives in components/workspace/brief/brief-tab.tsx.
export default function CampaignBriefPage() {
  return <BriefTab />;
}
