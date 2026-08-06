import { MapView } from "@/components/workspace/map/map-view";

// Map tab (/c/[campaignId]/map). The Lineage lens (design spec section 3a) is
// built here; the Interactions and Surface lenses (3b/3c) render explicit
// placeholders inside MapView rather than a partially-drawn graph. The lens
// switch lives in the tab body, not the shared 56px header, because it is a
// Map-only control - see components/workspace/workspace-header.tsx.
export default async function CampaignMapPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  return <MapView campaignId={campaignId} />;
}
