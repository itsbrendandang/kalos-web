// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Structure of the app frame (components/shell/app-shell.tsx): landmarks, the
 * skip link, the campaign's Harmonize / Predict / Validate navigation with the
 * engine's stage states, and an honest "not found" for an unknown campaign.
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
      if (url.endsWith("/api/campaigns")) return json({ campaigns: [meta] });
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
  });

  it("outside a campaign: workspace links, no cycle steps", async () => {
    pathname = "/";
    render(<AppShell>page</AppShell>);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("link", { name: "All campaigns" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Scale-up" }).getAttribute("href")).toBe("/scale-up");
    expect(within(nav).queryByRole("link", { name: /Harmonize/ })).toBeNull();
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
    expect(within(nav).getByText("Round 1")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: /Switch campaign \(current: CHO fed-batch\)/ })).toBeTruthy());
    expect(screen.getByRole("main").textContent).toContain("page");
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
