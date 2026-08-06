import { TabPlaceholder } from "@/components/workspace/tab-placeholder";

// Brief tab (/c/[campaignId]/brief). Not specified in the design handoff
// beyond appearing as the third segmented-control item - content is a
// separate build once that spec exists.
export default function CampaignBriefPage() {
  return <TabPlaceholder tab="Brief" />;
}
