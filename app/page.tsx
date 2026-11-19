import { Suspense } from "react";
import { CampaignHome, OverviewSkeleton } from "@/components/campaign/overview/campaign-home";

/** Campaign home. The client view reads ?stage= and must sit under Suspense. */
export default function Page() {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <CampaignHome />
    </Suspense>
  );
}
