import { WorkspaceShell } from "@/components/workspace/workspace-shell";

// Route-structure decision (see the build report for the full writeup):
// nested routes (this layout + page.tsx for Log, map/page.tsx, brief/page.tsx)
// rather than one route with client-side tab state. Reasons:
//  1. Linkable: /c/[id]/map is a real, shareable, refreshable URL, matching
//     the design's requirement that tabs are linkable.
//  2. Browser back behaves like every other page in this app: one tab
//     switch = one history entry, not a custom onpopstate handler.
//  3. Camera-position / lens-state preservation across tab switches (the
//     other stated requirement) comes for free from how App Router already
//     works: this layout persists across navigations between its child
//     routes (Log/Map/Brief), it does NOT remount - only the page below it
//     swaps. So any state that must survive a tab switch (rail open/closed,
//     Ask panel open/closed today; a future Map camera position) belongs up
//     here in WorkspaceShell/its context providers, not in a per-tab page's
//     local state. That's the same mechanism a single-route+tab-state
//     approach would reach for anyway (lifting state above the tab
//     switcher) - nested routes get it without giving up real URLs.
//
// A thin async server component (like app/experiments/[id]/page.tsx) that
// awaits params and hands the resolved id to a client component - the
// established pattern in this repo for "id":
export default async function CampaignWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  return <WorkspaceShell campaignId={campaignId}>{children}</WorkspaceShell>;
}
