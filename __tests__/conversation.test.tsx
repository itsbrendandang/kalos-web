// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import latestFixture from "./fixtures/plan-latest.json";
import campaignFixture from "./fixtures/plan-campaign.json";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn() }), useParams: () => ({}) }));
// The sheet's charts need the sheet this browser holds; none is held here.
vi.mock("@/lib/sheet-store", () => ({ useStoredSheet: () => ({ status: "missing" }) }));

import OverviewPage from "@/app/page";
import { AssistPanel } from "@/components/assist/assist-panel";
import { Sidebar } from "@/components/workbench/sidebar";
import { AssistProvider, useAssistPanel } from "@/hooks/use-assist";
import { useEffect } from "react";
import { EngineDataProvider } from "@/hooks/use-engine";
import { setViewMode } from "@/hooks/use-view-mode";

/*
 * The Simple view against a mocked engine: Overview as a conversation (the
 * verdict with its why-line, the next step, the recipes card, starter
 * prompts), a question with an embedded chart or table and its full-page
 * link, the abstained case, the shared thread in the panel, the short
 * sidebar, and the switch back to Full.
 */

// The fixture's analysis with one ranked input, so the starter questions and the ranking have something to show.
const LATEST = { ...latestFixture, drivers: [{ name: "pH", rho: 0.62, ci95: [0.35, 0.8], significant: true }] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const GUIDE = { state: "batch_proposed", step: "Review the five proposed recipes and start the ones you will run.", why: "The model proposed round 1.", why_it_matters: "Each proposed recipe costs a run.", action_route: "/campaign/plan", blockers: [], campaign_id: "cmp_x" };
const LOCAL = { provider: "ollama", model: "qwen2.5:7b", local: true, chunks: 40, built_at: "2026-05-01T09:00:00Z", building: false };
const DRIVERS_ANSWER = {
  answer: "Higher pH went with higher lipase_titer in your runs, more than any other input.",
  sources: [{ kind: "analysis", id: "drivers", quote: "Higher pH went with higher lipase_titer (clear signal)", campaign_id: "cmp_x" }],
  abstained: false,
  next: GUIDE,
};
const ABSTAINED = { answer: `${GUIDE.step} ${GUIDE.why}`, sources: [], abstained: true, next: GUIDE };

let asked: string[];
function mockEngine(ask: (q: string) => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/latest")) return json(LATEST);
      if (url.endsWith("/api/campaign")) return json(campaignFixture);
      if (url.endsWith("/api/assist/next")) return json(GUIDE);
      if (url.endsWith("/api/assist/index/status")) return json(LOCAL);
      if (url.endsWith("/api/assist/ask")) {
        const q = (JSON.parse(String(init?.body)) as { question: string }).question;
        asked.push(q);
        return ask(q);
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
}

/** Opens the Ask Kalos panel the way the sidebar button or ⌘J would. */
function OpenPanel() {
  const { setOpen } = useAssistPanel();
  useEffect(() => setOpen(true), [setOpen]);
  return null;
}

const mount = (ui: ReactNode) =>
  render(
    <EngineDataProvider>
      <AssistProvider>{ui}</AssistProvider>
    </EngineDataProvider>,
  );

beforeEach(() => {
  asked = [];
  localStorage.clear();
  setViewMode("simple");
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Overview in Simple view", () => {
  it("opens with the verdict and its why-line, the next step, the recipes card and starter questions from the state", async () => {
    mockEngine(() => json(DRIVERS_ANSWER));
    mount(<OverviewPage />);
    const from = await screen.findByRole("region", { name: "From Kalos" });
    expect(within(from).getByText(/^(Reliable|Not yet reliable|Not enough runs to tell)\./)).toBeTruthy();
    expect(within(from).getByText(/^Why this matters: /)).toBeTruthy();
    expect(await within(from).findByText(GUIDE.step)).toBeTruthy();
    expect(within(from).getByRole("link", { name: /Open Plan/ })).toBeTruthy();
    expect(within(from).getByText(/Proposed recipes for round 1/)).toBeTruthy();
    const starters = await screen.findByRole("region", { name: "Questions to start with" });
    const labels = within(starters).getAllByRole("button").map((b) => b.textContent);
    expect(labels[0]).toBe("What should I run next?");
    expect(labels).toContain("Which input matters most?");
    expect(labels).toContain("Show me lipase_titer by pH");
    expect(labels).not.toContain("Why can't you trust the model yet?");
    // The full Overview's numbers are not on this screen.
    expect(screen.queryByText(/^Numbers, trend and/)).toBeNull();
  });

  it("answers a starter question in the same thread, embeds the inputs ranking, keeps the sources, and links to the full page", async () => {
    mockEngine(() => json(DRIVERS_ANSWER));
    mount(<OverviewPage />);
    const starters = await screen.findByRole("region", { name: "Questions to start with" });
    fireEvent.click(within(starters).getByRole("button", { name: "Which input matters most?" }));
    expect(await screen.findByText(DRIVERS_ANSWER.answer)).toBeTruthy();
    expect(asked).toEqual(["Which input matters most?"]);
    expect(screen.getByText(/What went with higher lipase_titer in your runs/)).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Sources" })).getByRole("link", { name: "What went with the target" }).getAttribute("href")).toBe("/campaign/learn");
    expect(screen.getByRole("link", { name: "See the full page: Learn" }).getAttribute("href")).toBe("/campaign/learn");
    // Starter questions make way for the thread.
    expect(screen.queryByRole("region", { name: "Questions to start with" })).toBeNull();
  });

  it("says when a chart cannot be drawn because this browser does not hold the sheet, and still links to Data", async () => {
    mockEngine(() => json({ ...DRIVERS_ANSWER, answer: "Higher pH went with higher lipase_titer." }));
    mount(<OverviewPage />);
    const input = await screen.findByLabelText("Your question");
    fireEvent.change(input, { target: { value: "Show me lipase_titer by pH" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText(/This browser does not hold the sheet/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /See the full page: your sheet|See the full page: Data/ })).toBeTruthy();
  });

  it("shows the next-step card when the engine abstained", async () => {
    mockEngine(() => json(ABSTAINED));
    mount(<OverviewPage />);
    const input = await screen.findByLabelText("Your question");
    fireEvent.change(input, { target: { value: "What is the weather?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText("Nothing in your data answers that. Here is the next step instead.")).toBeTruthy();
    expect(screen.getAllByRole("region", { name: "What to do next" }).length).toBeGreaterThanOrEqual(2);
  });

  it("shares the thread with the Ask Kalos panel", async () => {
    mockEngine(() => json(DRIVERS_ANSWER));
    mount(
      <>
        <OverviewPage />
        <AssistPanel />
        <OpenPanel />
      </>,
    );
    const starters = await screen.findByRole("region", { name: "Questions to start with" });
    fireEvent.click(within(starters).getByRole("button", { name: "Which input matters most?" }));
    await screen.findAllByText(DRIVERS_ANSWER.answer);
    expect(asked).toHaveLength(1);
    // One conversation, two places: the panel shows the same answer without asking again.
    const panel = await screen.findByRole("dialog", { name: "Ask Kalos" });
    expect(await within(panel).findByText(DRIVERS_ANSWER.answer)).toBeTruthy();
    expect(asked).toHaveLength(1);
  });

  it("switches to the full Overview when the view is Full", async () => {
    mockEngine(() => json(DRIVERS_ANSWER));
    setViewMode("full");
    mount(<OverviewPage />);
    expect(await screen.findByText(/^Numbers, trend and/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "From Kalos" })).toBeNull();
  });
});

describe("the sidebar in Simple view", () => {
  it("lists Overview, Ask Kalos, Data and Documents only, with the view switch in the footer", async () => {
    mockEngine(() => json(DRIVERS_ANSWER));
    mount(<Sidebar onSearch={() => {}} onAsk={() => {}} />);
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(within(nav).getAllByRole("link").map((l) => l.textContent)).toEqual(["Overview", "Data", "Documents"]);
    expect(within(nav).getByRole("button", { name: /Ask Kalos/ })).toBeTruthy();
    expect(within(nav).queryByRole("list", { name: "Campaign stages" })).toBeNull();
    const group = screen.getByRole("group", { name: "View" });
    expect(within(group).getByRole("button", { name: "Simple" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(group).getByRole("button", { name: "Full" }));
    await waitFor(() => expect(within(nav).getByRole("list", { name: "Campaign stages" })).toBeTruthy());
    expect(within(nav).getAllByRole("link").map((l) => l.textContent)).toContain("Review");
    expect(localStorage.getItem("kalos.view")).toBe("full");
  });
});
