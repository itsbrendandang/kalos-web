import { LogTab } from "@/components/workspace/log/log-tab";

// Log is the default tab (/c/[campaignId] with no suffix). Body content lives
// in components/workspace/log/** - see log-tab.tsx for the composition.
export default function CampaignLogPage() {
  return <LogTab />;
}
