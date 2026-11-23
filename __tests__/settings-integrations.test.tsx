// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "@/app/settings/page";
import { CampaignsProvider } from "@/hooks/use-engine";
import type { Provider } from "@/lib/api";

/* The Settings page's integrations list against the engine's GET /api/providers; fetch is the only seam. */

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const base = { name: "anthropic", capability: "AI-assisted data checks", fallback: "rule-based checks", required_env: ["ANTHROPIC_API_KEY"] };
let providers: Provider[];

beforeEach(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/providers")) return json({ providers });
      return json({ campaigns: [], next_cursor: null });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderPage = () =>
  render(
    <CampaignsProvider>
      <SettingsPage />
    </CampaignsProvider>,
  );

/** Opens "Details for administrators", whose content mounts on first open. */
const openDetails = () => {
  const details = screen.getByText("Details for administrators").closest("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
};

describe("Settings integrations", () => {
  it("shows a provider turned off by the paid-call switch, without asking for its key", async () => {
    providers = [{ ...base, available: false, missing_env: [], disabled_by: ["KALOS_NO_PAID_CALLS"] }];
    renderPage();
    const item = (await screen.findByText("AI-assisted data checks")).closest("li")!;
    expect(within(item).getByText("Turned off")).toBeTruthy();
    expect(within(item).getByText(/Paid AI calls are turned off on this engine/)).toBeTruthy();
    openDetails();
    expect(await screen.findByText("turned off by KALOS_NO_PAID_CALLS on the engine")).toBeTruthy();
    expect(screen.queryByText(/set ANTHROPIC_API_KEY/)).toBeNull();
  });

  it("keeps the old wording against an engine without disabled_by", async () => {
    providers = [{ ...base, available: false, missing_env: [] }];
    renderPage();
    const item = (await screen.findByText("AI-assisted data checks")).closest("li")!;
    expect(within(item).getByText("Not set up")).toBeTruthy();
    expect(within(item).getByText("Without it, a built-in check is used instead.")).toBeTruthy();
    openDetails();
    expect(await screen.findByText("set ANTHROPIC_API_KEY on the engine to enable")).toBeTruthy();
  });
});
