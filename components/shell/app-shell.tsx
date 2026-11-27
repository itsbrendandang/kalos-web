"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ChevronsUpDown, FileText, FolderOpen, LayoutDashboard, Loader2, Menu, Milestone, Plus, Settings, X, type LucideIcon } from "lucide-react";
import { StepBadge } from "@/components/kit/cycle-stepper";
import { WorkspaceMenu } from "@/components/shell/workspace-menu";
import { ScienceGuide } from "@/components/shell/science-guide";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, ErrorState } from "@/components/ui/honest-state";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CampaignsProvider, EngineDataProvider, isNotFound, useCampaigns, useOptionalCampaignData } from "@/hooks/use-engine";
import { isJobActive } from "@/lib/api";
import { campaignStage, cycleSteps } from "@/lib/campaign-stage";
import { HOME_ROUTE, SCALE_UP_ROUTE, SETTINGS_ROUTE, campaignHref, parseCampaignPath, sectionFor, type CampaignPage, type RouteItem, type SectionKey } from "@/lib/routes";
import { cn } from "@/lib/utils";

const MAIN_ID = "main";

/** The section pills in the top bar. Settings sits on the right, beside the workspace menu. */
const SECTIONS = [
  { key: "campaigns", route: HOME_ROUTE },
  { key: "scale-up", route: SCALE_UP_ROUTE },
] as const satisfies readonly { key: SectionKey; route: RouteItem }[];

/**
 * The app frame: a top bar (brand, the section pills, Settings and the
 * workspace menu), a grey sidebar (campaign switcher, the campaign's
 * Harmonize / Predict / Validate steps with their engine state, Report and
 * the campaign's Scale-up track, or recent campaigns outside one), the page,
 * and inside /campaigns/[id] a slot for the assistant panel at xl widths. On
 * phones the sidebar and the pills move into a sheet.
 * Mounts what every page shares: the campaign list, and - inside
 * /campaigns/[id] - that campaign's engine data, keyed by id so switching
 * campaigns never shows the previous one's numbers.
 */
export function AppShell({ children, assistant }: { children: ReactNode; assistant?: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const inCampaign = parseCampaignPath(pathname);
  const frame = (
    <Frame pathname={pathname} assistant={inCampaign ? assistant : null}>
      {children}
    </Frame>
  );
  return (
    <CampaignsProvider>
      <TooltipProvider delay={300}>
        {inCampaign ? (
          <EngineDataProvider key={inCampaign.id} campaignId={inCampaign.id}>
            {frame}
          </EngineDataProvider>
        ) : (
          frame
        )}
      </TooltipProvider>
    </CampaignsProvider>
  );
}

// Only <main> and the assistant column scroll. Both are `relative` so absolutely positioned descendants (every
// sr-only label) are contained and clipped by them; otherwise those escape to the page, make the document taller
// than the screen, and scrollIntoView (Validate's #record, #track-record) scrolls the window and pushes the top bar
// off screen. overflow-clip on the frame keeps it from becoming a scroll container itself.
function Frame({ pathname, assistant, children }: { pathname: string; assistant: ReactNode; children: ReactNode }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <div className="flex h-dvh flex-col overflow-clip bg-bg print:block print:h-auto print:overflow-visible">
      <a
        href={`#${MAIN_ID}`}
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 text-label text-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <TopBar pathname={pathname} onOpenSheet={() => setSheetOpen(true)} />
      <div className="flex min-h-0 flex-1 overflow-clip print:block print:overflow-visible">
        <aside aria-label="Sidebar" className="hidden w-64 shrink-0 flex-col border-r border-border bg-bg md:flex print:hidden">
          <SidebarContent pathname={pathname} />
        </aside>
        <main id={MAIN_ID} tabIndex={-1} className="relative min-h-0 min-w-0 flex-1 overflow-y-auto outline-none print:overflow-visible">
          <div className="mx-auto w-full max-w-[1120px] px-4 py-6 md:px-8 md:py-8 print:max-w-none print:p-0">
            <CampaignGate><ScienceGuide pathname={pathname} />{children}</CampaignGate>
          </div>
        </main>
        {/*
         * Assistant panel slot (DESIGN.md "App frame"): only inside
         * /campaigns/[id] (AppShell passes null elsewhere) and only at xl
         * widths. The panel itself brings its own landmark and content; the
         * frame only gives it a 360px surface column. Nothing is passed yet.
         */}
        {assistant ? (
          <div data-slot="assistant" className="relative hidden w-[360px] shrink-0 flex-col overflow-y-auto border-l border-border bg-surface xl:flex print:hidden">
            {assistant}
          </div>
        ) : null}
      </div>
      <MobileSheet open={sheetOpen} onOpenChange={setSheetOpen} pathname={pathname} />
    </div>
  );
}

/** Inside a campaign, an unknown (or another tenant's) id is a plain "not found", not an engine outage. */
function CampaignGate({ children }: { children: ReactNode }) {
  const data = useOptionalCampaignData();
  if (!data) return <>{children}</>;
  if (isNotFound(data.detail)) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="Campaign not found"
        description="This campaign does not exist, or it belongs to another organization."
        action={
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            All campaigns
          </Link>
        }
      />
    );
  }
  if (data.detail.status === "error") {
    return <ErrorState onRetry={() => void data.detail.refresh()} busy={data.detail.refreshing} />;
  }
  return <>{children}</>;
}

function Brand() {
  return (
    <Link href="/" aria-label="Kalos, all campaigns" className="flex items-center rounded-lg px-1.5 py-1">
      <span className="text-title font-normal tracking-tight whitespace-nowrap text-fg">Kalos</span>
    </Link>
  );
}

/** The top bar: brand left, section pills centred (desktop), Settings and the workspace menu right. On phones, a menu button opens the sheet. */
function TopBar({ pathname, onOpenSheet }: { pathname: string; onOpenSheet: () => void }) {
  const section = sectionFor(pathname);
  return (
    <header className="relative flex h-14 shrink-0 items-center gap-1 border-b border-border bg-surface px-2 md:px-4 print:hidden">
      <button type="button" onClick={onOpenSheet} aria-label="Open navigation" className="grid size-9 place-items-center rounded-lg text-fg hover:bg-subtle md:hidden">
        <Menu className="size-5" aria-hidden />
      </button>
      <Brand />
      <nav aria-label="Sections" className="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:block">
        <SectionPills section={section} />
      </nav>
      <span className="flex-1" />
      <Link
        href={SETTINGS_ROUTE.href}
        aria-current={section === "settings" ? "page" : undefined}
        className={cn(
          "hidden h-9 items-center gap-2 rounded-lg px-2.5 text-label md:inline-flex",
          section === "settings" ? "bg-selected text-fg" : "text-fg-muted hover:bg-subtle hover:text-fg",
        )}
      >
        <Settings className="size-4" aria-hidden />
        {SETTINGS_ROUTE.label}
      </Link>
      <WorkspaceMenu side="bottom" />
    </header>
  );
}

function SectionPills({ section, stacked = false }: { section: SectionKey; stacked?: boolean }) {
  return (
    <ul className={cn("flex gap-1.5", stacked ? "flex-col" : "items-center")}>
      {SECTIONS.map(({ key, route }) => {
        const active = key === section;
        return (
          <li key={key}>
            <Link
              href={route.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center rounded-full px-3.5 text-label whitespace-nowrap",
                stacked && "flex w-full",
                active ? "bg-ink text-ink-fg" : "text-fg-muted hover:bg-subtle hover:text-fg",
              )}
            >
              {route.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SidebarContent({ pathname }: { pathname: string }) {
  const here = parseCampaignPath(pathname);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-3">
      <CampaignSwitcher currentId={here?.id ?? null} />
      <nav aria-label="Primary" className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
        {here ? <CampaignNav page={here.page} /> : <RecentCampaigns />}
      </nav>
    </div>
  );
}

/** A sidebar row: the active one is a grey `bg-selected` fill on the canvas, the rest muted with a quiet hover. */
const ROW = (active: boolean) => (active ? "bg-selected text-fg" : "text-fg-muted hover:bg-subtle hover:text-fg");

function NavLink({
  href,
  icon: Icon,
  active,
  children,
  className,
}: {
  href: string;
  icon?: LucideIcon;
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("flex h-9 items-center gap-2.5 rounded-lg px-2 text-label", ROW(active), className)}
    >
      {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </Link>
  );
}

/** The campaign's own navigation: Overview, the three cycle steps with their engine state, Report, and the scale-up track. */
function CampaignNav({ page }: { page: CampaignPage }) {
  const data = useOptionalCampaignData();
  if (!data) return null;
  const id = data.campaignId;
  const latest = data.latest.data;
  const summary = data.campaign.data;
  const stage = latest && summary ? campaignStage(latest, summary, id) : null;
  const steps = stage ? cycleSteps(stage, id) : null;
  const job = data.upload.job;
  const uploading = isJobActive(job);
  return (
    <div className="flex flex-col gap-px">
      <p className="px-2 pb-1 text-caption text-fg-muted">This campaign</p>
      <NavLink href={campaignHref(id)} icon={LayoutDashboard} active={page === ""}>
        Overview
      </NavLink>
      <p className="px-2 pt-3 pb-1 text-caption text-fg-muted">{stage?.round != null ? `Round ${stage.round}` : "Cycle"}</p>
      {(steps ?? []).map((s) => {
        const busy = (s.key === "harmonize" && uploading) || (s.key === "validate" && data.reanalysis.running);
        return (
          <Link
            key={s.key}
            href={s.href}
            aria-current={page === s.key ? "page" : undefined}
            className={cn("flex items-start gap-2.5 rounded-lg px-2 py-2", page === s.key ? "bg-selected" : "hover:bg-subtle")}
          >
            <StepBadge n={s.n} state={s.state} />
            <span className="min-w-0 flex-1">
              <span className={cn("block text-label", page === s.key ? "text-fg" : "text-fg-muted")}>{s.label}</span>
              <span className="flex items-center gap-1 truncate text-caption text-fg-muted">
                {busy ? <Loader2 className="size-3 shrink-0 animate-spin text-accent motion-reduce:animate-none" aria-hidden /> : null}
                <span className="truncate">{busy ? (s.key === "harmonize" ? `Analyzing ${Math.round((job?.progress ?? 0) * 100)}%` : "Re-analyzing") : s.detail}</span>
              </span>
            </span>
          </Link>
        );
      })}
      {!steps ? (
        <div className="flex flex-col gap-2 px-2 py-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-8 rounded-lg bg-subtle" />
          ))}
        </div>
      ) : null}
      <div className="pt-2">
        <NavLink href={campaignHref(id, "report")} icon={FileText} active={page === "report"}>
          Report and export
        </NavLink>
        <NavLink href={campaignHref(id, "scale-up")} icon={Milestone} active={page === "scale-up"}>
          Scale-up track
        </NavLink>
      </div>
    </div>
  );
}

function RecentCampaigns() {
  const campaigns = useCampaigns();
  const list = (campaigns.data ?? []).slice().sort((a, b) => b.updated_at - a.updated_at).slice(0, 6);
  if (list.length === 0) return null;
  return (
    <div className="flex flex-col gap-px">
      <p className="px-2 pb-1 text-caption text-fg-muted">Recent campaigns</p>
      {list.map((c) => (
        <NavLink key={c.id} href={campaignHref(c.id)} icon={FolderOpen} active={false}>
          {c.name}
        </NavLink>
      ))}
    </div>
  );
}

function CampaignSwitcher({ currentId }: { currentId: string | null }) {
  const router = useRouter();
  const campaigns = useCampaigns();
  const data = useOptionalCampaignData();
  const currentName = data?.detail.data?.campaign.name ?? (currentId ? "Loading campaign" : "Choose a campaign");
  const list = (campaigns.data ?? []).slice().sort((a, b) => b.updated_at - a.updated_at);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Switch campaign (current: ${currentName})`}
        className="flex h-11 w-full items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-left hover:border-border-strong data-popup-open:border-border-strong"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-caption text-fg-muted">Campaign</span>
          <span className="block truncate text-label text-fg">{currentName}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-fg-muted" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" sideOffset={6} className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Campaigns</DropdownMenuLabel>
          {campaigns.status === "error" ? <DropdownMenuItem disabled>Could not load campaigns</DropdownMenuItem> : null}
          {campaigns.status === "loading" ? <DropdownMenuItem disabled>Loading...</DropdownMenuItem> : null}
          {list.map((c) => (
            <DropdownMenuItem key={c.id} onClick={() => router.push(campaignHref(c.id))} className={cn(c.id === currentId && "text-accent")}>
              <span className="truncate">{c.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/?new=1")}>
          <Plus aria-hidden />
          New campaign
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/")}>
          <LayoutDashboard aria-hidden />
          All campaigns
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileSheet({ open, onOpenChange, pathname }: { open: boolean; onOpenChange: (open: boolean) => void; pathname: string }) {
  const section = sectionFor(pathname);
  // Following any link closes the sheet.
  const closeOnNavigate = (target: EventTarget) => {
    if (target instanceof Element && target.closest("a")) onOpenChange(false);
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 md:hidden dark:bg-black/60" />
        <Dialog.Popup
          aria-label="Navigation"
          onClickCapture={(e) => closeOnNavigate(e.target)}
          className="fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-xs flex-col border-r border-border bg-bg transition-transform duration-200 data-ending-style:-translate-x-full data-starting-style:-translate-x-full md:hidden"
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface pr-2 pl-4">
            <Dialog.Title className="text-heading text-fg">Navigation</Dialog.Title>
            <Dialog.Close aria-label="Close navigation" className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-subtle hover:text-fg">
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>
          <nav aria-label="Sections" className="flex flex-col gap-1.5 border-b border-border p-3">
            <SectionPills section={section} stacked />
            <NavLink href={SETTINGS_ROUTE.href} icon={Settings} active={section === "settings"}>
              {SETTINGS_ROUTE.label}
            </NavLink>
          </nav>
          <SidebarContent pathname={pathname} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
