// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Structure of the app frame (components/shell/app-shell.tsx): landmarks, the
 * skip link, the top bar's section pills and Settings link, the campaign's
 * Harmonize / Predict / Validate navigation with the engine's stage states,
 * the assistant slot (campaign pages only), and an honest "not found" for an
 * unknown campaign.
 * Replaces the editor-tab-strip structure test of the removed workbench shell.
 */

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
// The workspace menu calls a server action; the frame only needs its trigger.
vi.mock("@/components/shell/workspace-menu", () => ({ WorkspaceMenu: () => <button type="button">Workspace menu</button> }));

import { AppShell } from "@/components/shell/app-shell";

const ID = "cmp_0123456789abcdef0123456789abcdef";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const summary = {
  has_campaign: true,
  target: "titer_g_L",
  features: ["pH"],
  n_base: 160,
  best: 1.42,
  round: 0,
  history: [{ round: 0, best: 1.42, n_base: 160 }],
  pending: [],
  n_awaiting: 0,
  n_measured: 0,
  stage: {
    round: 1,
    current: "plan",
    started: 0,
    steps: [
      { key: "setup", state: "done", detail: "Run sheet analyzed" },
      { key: "plan", state: "current", detail: "5 recipes proposed" },
      { key: "run", state: "upcoming", detail: "" },
      { key: "record", state: "upcoming", detail: "" },
      { key: "learn", state: "upcoming", detail: "" },
    ],
  },
  next_action: { stage: "plan", action: "Review and start round 1", reason: "The model proposed 5 recipes." },
};
const meta = { id: ID, name: "CHO fed-batch", created_by: "u", created_at: 1, updated_at: 2, archived_at: null, archived: false, seeded: true, is_default: false };

let detailStatus = 200;
beforeEach(() => {
  detailStatus = 200;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      // The campaign list is one summary request (GET /api/campaigns?summary=true).
      if (url.endsWith("/api/campaigns") || url.includes("/api/campaigns?")) return json({ campaigns: [meta], next_cursor: null });
      if (url.endsWith(`/api/campaigns/${ID}`)) return detailStatus === 200 ? json({ campaign: meta, summary }) : json({ error: "not found", code: "not_found" }, 404);
      if (url.endsWith(`/api/campaigns/${ID}/analysis`)) return json({ has_data: true, proposals: [1, 2, 3, 4, 5] });
      if (url.includes(`/api/campaigns/${ID}/jobs`)) return json({ jobs: [] });
      return json({ error: "unexpected" }, 500);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("app shell", () => {
  it("has a skip link to the main landmark and a labelled sidebar", () => {
    pathname = "/";
    render(<AppShell>page</AppShell>);
    expect(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href")).toBe("#main");
    expect(screen.getByRole("main").id).toBe("main");
    expect(screen.getByRole("complementary", { name: "Sidebar" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Sections" })).toBeTruthy();
  });

  it("main contains its sr-only text, so an anchor jump scrolls main and never the page (top bar stays)", () => {
    pathname = "/";
    render(<AppShell>page</AppShell>);
    const main = screen.getByRole("main");
    // A positioned scroll container clips absolutely positioned descendants; without it they make the document scroll.
    expect(main.className).toMatch(/\brelative\b/);
    expect(main.className).toMatch(/\boverflow-y-auto\b/);
    expect(main.closest(".h-dvh")?.className).toMatch(/\boverflow-clip\b/);
  });

  it("the top bar: section pills with aria-current, Settings and the workspace menu", () => {
    pathname = "/";
    render(<AppShell>page</AppShell>);
    const bar = screen.getByRole("banner");
    const pills = within(bar).getByRole("navigation", { name: "Sections" });
    const campaigns = within(pills).getByRole("link", { name: "Campaigns" });
    expect(campaigns.getAttribute("href")).toBe("/");
    expect(campaigns.getAttribute("aria-current")).toBe("page");
    expect(campaigns.className).toContain("bg-ink");
    const scale = within(pills).getByRole("link", { name: "Scale-up" });
    expect(scale.getAttribute("href")).toBe("/scale-up");
    expect(scale.getAttribute("aria-current")).toBeNull();
    expect(within(bar).getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    expect(within(bar).getByRole("button", { name: "Workspace menu" })).toBeTruthy();
    expect(within(bar).getByRole("button", { name: "Open navigation" })).toBeTruthy();
  });

  it("the Scale-up pill is current on /scale-up, Settings on /settings", () => {
    pathname = "/scale-up";
    const { unmount } = render(<AppShell>page</AppShell>);
    const pills = screen.getByRole("navigation", { name: "Sections" });
    expect(within(pills).getByRole("link", { name: "Scale-up" }).getAttribute("aria-current")).toBe("page");
    expect(within(pills).getByRole("link", { name: "Campaigns" }).getAttribute("aria-current")).toBeNull();
    unmount();
    pathname = "/settings/security";
    render(<AppShell>page</AppShell>);
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("aria-current")).toBe("page");
    expect(within(screen.getByRole("navigation", { name: "Sections" })).queryByRole("link", { current: "page" })).toBeNull();
  });

  it("outside a campaign: recent campaigns, no cycle steps, no assistant slot", async () => {
    pathname = "/";
    const { container } = render(<AppShell assistant={<p>assistant</p>}>page</AppShell>);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).queryByRole("link", { name: /Harmonize/ })).toBeNull();
    expect(container.querySelector('[data-slot="assistant"]')).toBeNull();
    expect(screen.queryByText("assistant")).toBeNull();
    await waitFor(() => expect(within(nav).getByRole("link", { name: "CHO fed-batch" }).getAttribute("href")).toBe(`/campaigns/${ID}`));
  });

  it("inside a campaign: Overview, the three numbered steps with the engine's states, and Report", async () => {
    pathname = `/campaigns/${ID}/predict`;
    render(<AppShell>page</AppShell>);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    await waitFor(() => expect(within(nav).getByRole("link", { name: /Predict/ })).toBeTruthy());
    expect(within(nav).getByRole("link", { name: "Overview" }).getAttribute("href")).toBe(`/campaigns/${ID}`);
    const predict = within(nav).getByRole("link", { name: /Predict/ });
    expect(predict.getAttribute("href")).toBe(`/campaigns/${ID}/predict`);
    expect(predict.getAttribute("aria-current")).toBe("page");
    expect(predict.textContent).toContain("5 recipes proposed");
    expect(within(nav).getByRole("link", { name: /Harmonize/ }).textContent).toContain("Run sheet analyzed");
    expect(within(nav).getByRole("link", { name: /Validate/ }).getAttribute("href")).toBe(`/campaigns/${ID}/validate`);
    expect(within(nav).getByRole("link", { name: "Report and export" }).getAttribute("href")).toBe(`/campaigns/${ID}/report`);
    expect(within(nav).getByRole("link", { name: "Scale-up track" }).getAttribute("href")).toBe(`/campaigns/${ID}/scale-up`);
    // The global Scale-up lives in the top bar; inside a campaign the Campaigns pill stays current.
    const pills = screen.getByRole("navigation", { name: "Sections" });
    expect(within(pills).getByRole("link", { name: "Scale-up" }).getAttribute("href")).toBe("/scale-up");
    expect(within(pills).getByRole("link", { name: "Campaigns" }).getAttribute("aria-current")).toBe("page");
    expect(predict.className).toContain("bg-selected");
    expect(within(nav).getByText("Round 1")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: /Switch campaign \(current: CHO fed-batch\)/ })).toBeTruthy());
    expect(screen.getByRole("main").textContent).toContain("page");
  });

  it("the campaign's scale-up track is highlighted on its page, not the global Scale-up", async () => {
    pathname = `/campaigns/${ID}/scale-up`;
    render(<AppShell>page</AppShell>);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    await waitFor(() => expect(within(nav).getByRole("link", { name: "Scale-up track" }).getAttribute("aria-current")).toBe("page"));
    const pills = screen.getByRole("navigation", { name: "Sections" });
    expect(within(pills).getByRole("link", { name: "Scale-up" }).getAttribute("aria-current")).toBeNull();
  });

  it("inside a campaign the assistant slot renders what it is given, and nothing when given nothing", async () => {
    pathname = `/campaigns/${ID}/predict`;
    const { container, unmount } = render(<AppShell assistant={<p>assistant</p>}>page</AppShell>);
    const slot = container.querySelector('[data-slot="assistant"]');
    expect(slot?.textContent).toBe("assistant");
    expect(slot?.className).toContain("xl:flex");
    unmount();
    const again = render(<AppShell>page</AppShell>);
    expect(again.container.querySelector('[data-slot="assistant"]')).toBeNull();
  });

  it("an unknown campaign id reads as not found, not as an engine outage, and hides the page", async () => {
    pathname = `/campaigns/${ID}`;
    detailStatus = 404;
    render(<AppShell>secret page</AppShell>);
    await waitFor(() => expect(screen.getByText("Campaign not found")).toBeTruthy());
    expect(screen.queryByText("secret page")).toBeNull();
    expect(screen.queryByText(/Could not reach the analysis service/)).toBeNull();
  });
});
