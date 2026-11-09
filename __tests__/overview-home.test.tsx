// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Campaign, LatestResult } from "@/lib/api";

const push = vi.fn();
const replace = vi.fn();
let search = new URLSearchParams();

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push, replace }),
  useSearchParams: () => search,
}));

vi.mock("next/dynamic", () => ({
  default: () => function ChartStub() {
    return null;
  },
}));

vi.mock("@/lib/demo", () => ({ DEMO_MODE: false }));

import { CampaignHome } from "@/components/campaign/overview/campaign-home";
import { StagePanel } from "@/components/campaign/overview/stage-panel";
import { SummaryStrip } from "@/components/campaign/overview/summary-strip";
import { buildCampaignOverview } from "@/lib/campaign-overview";
import { EngineDataProvider, useLatest } from "@/hooks/use-engine";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function fit(overrides: Record<string, unknown> = {}): LatestResult {
  return {
    has_data: true,
    dataset: "good.csv",
    updated: 1_700_000_000,
    campaign_generation: "gen-a",
    n: 12,
    d: 1,
    target: "titer (g/L)",
    group_col: null,
    targets: ["titer (g/L)"],
    features: ["pH"],
    cv_spearman: 0.8,
    cv_ci95: [0.4, 0.9],
    cv_n_groups: 6,
    best: 2.4,
    drivers: [],
    proposal_features: ["pH"],
    proposals: [
      { vals: [7], pred: 2.8, std: 0.1, mode: "explore", reason: "range" },
      { vals: [6], pred: 2.5, std: 0.2, mode: "exploit", reason: "near" },
    ],
    oof: [],
    reliability: { spearman: 0.8, ci95: [0.4, 0.9], spearman_floor: 0.2, clears_floor: true, ci_excludes_zero: true, unmodeled: [] },
    ...overrides,
  } as LatestResult;
}

function loop(overrides: Record<string, unknown> = {}): Campaign {
  return {
    has_campaign: true,
    target: "titer (g/L)",
    features: ["pH"],
    n_base: 12,
    best: 2.4,
    round: 2,
    history: [
      { round: 0, best: 2, n_base: 10 },
      { round: 2, best: 2.4, n_base: 12 },
    ],
    pending: [],
    n_awaiting: 0,
    n_measured: 4,
    analysis_in_sync: true,
    ...overrides,
  } as Campaign;
}

let latestBody: () => Response | Promise<Response>;
let campaignBody: () => Response | Promise<Response>;

beforeEach(() => {
  search = new URLSearchParams("org=acme");
  push.mockReset();
  replace.mockReset();
  latestBody = () => json(fit());
  campaignBody = () => json(loop());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/latest")) return latestBody();
      if (url.endsWith("/api/campaign")) return campaignBody();
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function ApplyPromotion() {
  const latest = useLatest();
  return (
    <button
      type="button"
      onClick={() =>
        latest.set(
          fit({
            promotion: { passed: false, failures: ["ece"], metrics: { ece: 0.4 }, summary: "no", meaning: "bands" },
          }),
        )
      }
    >
      Apply promotion failure
    </button>
  );
}

function renderHome(withApply = false) {
  return render(
    <EngineDataProvider>
      {withApply ? <ApplyPromotion /> : null}
      <CampaignHome />
    </EngineDataProvider>,
  );
}

describe("campaign home states", () => {
  it("shows a skeleton before either response, not a zero or an example", () => {
    latestBody = () => new Promise<Response>(() => {});
    campaignBody = () => new Promise<Response>(() => {});
    renderHome();
    expect(screen.getByRole("status", { name: "Loading the campaign" })).toBeTruthy();
    expect(screen.queryByText("Example data")).toBeNull();
    expect(screen.queryByText("0.00")).toBeNull();
  });

  it("shows a connection error instead of demo or empty data", async () => {
    latestBody = () => json({ error: "nope" }, 503);
    campaignBody = () => json({ error: "nope" }, 503);
    renderHome();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/connection problem, not an empty campaign/)).toBeTruthy();
    expect(screen.queryByText("Example data")).toBeNull();
    expect(screen.queryByText("Illustrative data only.")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows the measured summary and three decisions for a confirmed empty campaign", async () => {
    latestBody = () => json({ has_data: false });
    campaignBody = () => json({ has_campaign: false });
    renderHome();
    expect(await screen.findByRole("heading", { level: 1, name: "Campaign" })).toBeTruthy();
    expect(screen.getAllByText("Baseline unavailable").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not evaluated").length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: /Conditions/ })).toBeTruthy();
    expect(screen.queryByText("Example data")).toBeNull();
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(String(replace.mock.calls.at(-1)?.[0])).toContain("org=acme");
    expect(String(replace.mock.calls.at(-1)?.[0])).toContain("stage=conditions");
    expect(replace.mock.calls.at(-1)?.[1]).toMatchObject({ scroll: false });
  });

  it("opens the explicit stage and pushes a click without scrolling", async () => {
    search = new URLSearchParams("org=acme&stage=learning");
    renderHome();
    await waitFor(() => expect(screen.getByRole("tab", { name: /Model learning/ }).getAttribute("aria-selected")).toBe("true"));
    expect(replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: /Promotion evidence/ }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    const href = String(push.mock.calls.at(-1)?.[0]);
    expect(href).toContain("org=acme");
    expect(href).toContain("stage=promotion");
    expect(push.mock.calls.at(-1)?.[1]).toMatchObject({ scroll: false });
  });

  it("keeps a loaded campaign when the analysis request fails", async () => {
    latestBody = () => json({ error: "nope" }, 503);
    renderHome();
    expect(await screen.findByText("2.40")).toBeTruthy();
    expect(screen.queryByText("Could not reach the analysis service")).toBeNull();
    await waitFor(() => expect(screen.getByRole("tab", { name: /Model learning/ }).getAttribute("aria-selected")).toBe("true"));
    expect(screen.getAllByText("Couldn't load model evidence").length).toBeGreaterThan(0);
  });

  it("keeps a loaded analysis when the campaign request fails", async () => {
    campaignBody = () => json({ error: "nope" }, 503);
    renderHome();
    expect(await screen.findByText("2.40")).toBeTruthy();
    expect(screen.queryByText("Could not reach the analysis service")).toBeNull();
    await waitFor(() => expect(screen.getByRole("tab", { name: /Measured results/ }).getAttribute("aria-selected")).toBe("true"));
    expect(screen.getAllByText("Couldn't load runs").length).toBeGreaterThan(0);
  });

  it("keeps every stage panel mounted so aria-controls resolves", async () => {
    renderHome();
    const tab = await screen.findByRole("tab", { name: /Conditions/ });
    const id = tab.getAttribute("aria-controls");
    expect(id).toBeTruthy();
    expect(document.getElementById(id as string)).toBeTruthy();
  });

  it("marks the conditions skeleton aria-busy", () => {
    const model = buildCampaignOverview({
      latest: { data: null, error: false, loading: true },
      campaign: { data: null, error: false, loading: true },
      rejection: null,
      selectedCount: null,
      startedHere: false,
      startInFlight: false,
      illustrative: false,
    });
    render(<StagePanel model={model} stage="conditions" campaign={null} onRetry={() => {}} busy={false} />);
    expect(screen.getByRole("status", { name: "Loading conditions" }).getAttribute("aria-busy")).toBe("true");
  });

  it("does not print a missing pending count as zero", () => {
    const campaign = loop();
    delete (campaign as { n_awaiting?: number }).n_awaiting;
    const model = buildCampaignOverview({
      latest: { data: fit(), error: false, loading: false },
      campaign: { data: { ...campaign, pending: [] } as Campaign, error: false, loading: false },
      rejection: null,
      selectedCount: null,
      startedHere: false,
      startInFlight: false,
      illustrative: false,
    });
    render(<SummaryStrip model={model} />);
    expect(screen.getByText(/pending unavailable/)).toBeTruthy();
    expect(screen.queryByText(/0 pending/)).toBeNull();
  });

  it("does not move off a chosen stage when a new promotion failure arrives", async () => {
    renderHome(true);
    await waitFor(() => expect(String(replace.mock.calls.at(-1)?.[0] ?? "")).toContain("stage=experiments"));
    fireEvent.click(screen.getByRole("tab", { name: /Measured results/ }));
    await waitFor(() => expect(String(push.mock.calls.at(-1)?.[0] ?? "")).toContain("stage=results"));
    const pushes = push.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Apply promotion failure" }));
    expect(await screen.findByText("New issue in Promotion evidence")).toBeTruthy();
    expect(push.mock.calls.length).toBe(pushes);
    expect(screen.getByRole("tab", { name: /Measured results/ }).getAttribute("aria-selected")).toBe("true");
  });
});
