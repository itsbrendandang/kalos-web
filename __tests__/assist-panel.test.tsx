// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn() }) }));

import { AssistChat } from "@/components/assist/assist-chat";
import { AssistantSettings } from "@/components/assist/assistant-settings";
import { NextStepFromEngine, NextStepLine } from "@/components/assist/next-step-card";
import { AssistProvider } from "@/hooks/use-assist";
import { EngineDataProvider } from "@/hooks/use-engine";

/*
 * The assistant against a mocked engine, one case per state: an older engine
 * without the routes, an assistant that is off, a local model, a cloud model,
 * a sourced answer, an abstained answer, and a model that did not answer.
 * fetch is the only seam.
 */

const SHA = "b".repeat(64);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const GUIDE = {
  state: "runs_awaiting",
  step: "Record the two results that are back.",
  why: "Two runs from round 1 have come back from the lab.",
  why_it_matters: "The model only learns from runs with a result.",
  action_route: "/campaign/record",
  blockers: [{ code: "runs_awaiting", text: "One run of three has no result yet.", why: "It stays out of the model until it does." }],
  campaign_id: null,
};
const LOCAL = { provider: "ollama", model: "qwen2.5:7b", local: true, chunks: 42, built_at: "2026-05-01T11:30:00Z", building: false, retriever: "bm25" };
const CLOUD = { ...LOCAL, provider: "anthropic", model: "claude", local: false };
const SOURCED = {
  answer: "The best measured Titer was 63.3 g/L, in round 1. The model predicted 70.1 for recipe 2.",
  sources: [
    { kind: "round", id: "1", quote: "Measured Titer 63.3 g/L", campaign_id: null },
    { kind: "sheet", id: SHA, quote: "Column Titer, the target", campaign_id: null },
    { kind: "analysis", id: "proposals", quote: "Predicted Titer 70.1 for recipe 2", campaign_id: null },
    { kind: "doc", id: "docs/ASSISTANT.md", quote: "Answers quote only your own data.", campaign_id: null },
  ],
  abstained: false,
  next: GUIDE,
};
const ABSTAINED = { answer: `${GUIDE.step} ${GUIDE.why}`, sources: [], abstained: true, next: GUIDE };

type Engine = { next?: () => Response; status?: () => Response; ask?: (body: unknown) => Response; rebuild?: () => Response };
let engine: Engine;
let asked: unknown[];

function mockEngine(e: Engine) {
  engine = e;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/latest")) return json(latestFixture);
      if (url.endsWith("/api/campaign")) return json(campaignFixture);
      if (url.endsWith("/api/assist/next")) return engine.next?.() ?? json({ error: "not found", code: "not_found" }, 404);
      if (url.endsWith("/api/assist/index/status")) return engine.status?.() ?? json({ error: "not found", code: "not_found" }, 404);
      if (url.endsWith("/api/assist/ask")) {
        const body: unknown = JSON.parse(String(init?.body));
        asked.push(body);
        return engine.ask?.(body) ?? json({ error: "not found", code: "not_found" }, 404);
      }
      if (url.endsWith("/api/assist/index/rebuild")) return engine.rebuild?.() ?? json({ error: "not found", code: "not_found" }, 404);
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
}

/** Opens the disclosure whose summary holds `summary` (jsdom does not toggle <details> on a click). */
function open(summary: HTMLElement) {
  const details = summary.closest("details")!;
  act(() => {
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
  });
}

const mount = (ui: ReactNode) =>
  render(
    <EngineDataProvider>
      <AssistProvider>{ui}</AssistProvider>
    </EngineDataProvider>,
  );

async function ask(question: string) {
  const input = await screen.findByLabelText("Your question");
  fireEvent.change(input, { target: { value: question } });
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
}

beforeEach(() => {
  asked = [];
  pathname = "/";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the next-step card", () => {
  it("shows the engine's step, one button to its route, and the blockers under a disclosure", async () => {
    mockEngine({ next: () => json(GUIDE) });
    mount(<NextStepFromEngine />);
    const card = await screen.findByRole("region", { name: "What to do next" });
    expect(within(card).getByText(GUIDE.step)).toBeTruthy();
    const link = within(card).getByRole("link", { name: /Open Record/ });
    expect(link.getAttribute("href")).toBe("/campaign/record");
    expect(within(card).getAllByRole("link")).toHaveLength(1);
    // The reasons and the blocker are one click down, not on the surface.
    expect(within(card).queryByText(GUIDE.blockers[0].text)).toBeNull();
    open(within(card).getByText("Why"));
    expect(within(card).getByText(GUIDE.why)).toBeTruthy();
    expect(within(card).getByText(GUIDE.why_it_matters)).toBeTruthy();
    open(within(card).getByText("One thing is in the way"));
    expect(within(card).getByText(GUIDE.blockers[0].text)).toBeTruthy();
    expect(within(card).getByText(GUIDE.blockers[0].why)).toBeTruthy();
  });

  it("falls back to the step worked out from the campaign when the engine has no guide route", async () => {
    mockEngine({});
    mount(<NextStepFromEngine />);
    const card = await screen.findByRole("region", { name: "What to do next" });
    // plan-campaign.json: an analysed sheet with 5 recipes proposed and nothing started.
    expect(within(card).getByText("Review the proposed runs.")).toBeTruthy();
    expect(within(card).getByRole("link", { name: /Review the proposed runs/ }).getAttribute("href")).toBe("/campaign/plan");
  });

  it("is one compact line at the foot of a stage page, hidden on the page it points to", async () => {
    mockEngine({ next: () => json(GUIDE) });
    pathname = "/campaign/plan";
    const { unmount } = mount(<NextStepLine />);
    const line = await screen.findByRole("complementary", { name: "What to do next" });
    expect(line.textContent).toContain(GUIDE.step);
    expect(line.textContent).toContain("one thing in the way");
    expect(within(line).getByRole("link").getAttribute("href")).toBe("/campaign/record");
    unmount();
    pathname = "/campaign/record";
    mount(<NextStepLine />);
    await waitFor(() => expect((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => String(c[0]).endsWith("/api/assist/next"))).toBe(true));
    expect(screen.queryByRole("complementary", { name: "What to do next" })).toBeNull();
  });
});

describe("the question panel", () => {
  it("shows the guide only, and how to turn the assistant on, when the engine says it is off", async () => {
    mockEngine({ next: () => json(GUIDE), status: () => json({ error: "assist disabled", code: "assist_disabled" }, 404) });
    mount(<AssistChat />);
    expect(await screen.findByText(/The assistant is off/)).toBeTruthy();
    const card = await screen.findByRole("region", { name: "What to do next" });
    expect(within(card).getByText(GUIDE.step)).toBeTruthy();
    expect(screen.queryByLabelText("Your question")).toBeNull();
    expect(screen.getByText("How to turn it on")).toBeTruthy();
  });

  it("shows the guide only on an older engine without the assistant", async () => {
    mockEngine({});
    mount(<AssistChat />);
    expect(await screen.findByText(/The assistant is off/)).toBeTruthy();
    expect(await screen.findByText("Review the proposed runs.")).toBeTruthy();
    expect(screen.queryByLabelText("Your question")).toBeNull();
  });

  it("says in one line that a local model runs on this Mac, and that a cloud model is sent away", async () => {
    mockEngine({ next: () => json(GUIDE), status: () => json(LOCAL) });
    const { unmount } = mount(<AssistChat />);
    expect(await screen.findByText("Runs on this Mac (qwen2.5:7b). Nothing leaves it.")).toBeTruthy();
    unmount();
    mockEngine({ next: () => json(GUIDE), status: () => json(CLOUD) });
    mount(<AssistChat />);
    expect(await screen.findByText("Questions and the matching parts of your data are sent to Anthropic.")).toBeTruthy();
  });

  it("renders an answer with its sources as chips that link to the round, sheet and model results, keeping Measured and Predicted", async () => {
    mockEngine({ next: () => json(GUIDE), status: () => json(LOCAL), ask: () => json(SOURCED) });
    mount(<AssistChat />);
    await ask("What was the best titer?");
    expect(asked).toEqual([{ question: "What was the best titer?" }]);
    expect(await screen.findByText(SOURCED.answer)).toBeTruthy();
    const chips = screen.getByRole("list", { name: "Sources" });
    const links = within(chips).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/data/round/1", `/data/sheet/${SHA}`, "/campaign/learn"]);
    expect(within(chips).getByText("Round 1")).toBeTruthy();
    expect(within(chips).getByText("Guide page: ASSISTANT").closest("a")).toBeNull();
    open(screen.getByText("What was quoted"));
    expect(screen.getByText("Measured Titer 63.3 g/L")).toBeTruthy();
    expect(screen.getAllByText("Measured").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Predicted").length).toBeGreaterThan(0);
    expect(screen.queryByRole("region", { name: "What to do next" })).toBeNull();
  });

  it("shows the next-step card instead of an answer when the engine abstained", async () => {
    mockEngine({ next: () => json(GUIDE), status: () => json(LOCAL), ask: () => json(ABSTAINED) });
    mount(<AssistChat />);
    await ask("What is the weather?");
    expect(await screen.findByText("Nothing in your data answers that. Here is the next step instead.")).toBeTruthy();
    const card = screen.getByRole("region", { name: "What to do next" });
    expect(within(card).getByText(GUIDE.step)).toBeTruthy();
    expect(within(card).getByRole("link", { name: /Open Record/ })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Sources" })).toBeNull();
  });

  it("says plainly when the model did not answer, and keeps the question field", async () => {
    mockEngine({ next: () => json(GUIDE), status: () => json(LOCAL), ask: () => json({ error: "no model", code: "assist_provider_unavailable" }, 503) });
    mount(<AssistChat />);
    await ask("Anything?");
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "The model did not answer. Check that it is running, then ask again.");
    expect(screen.getByLabelText("Your question")).toBeTruthy();
  });

  it("switches to the off state if the assistant is turned off between questions", async () => {
    mockEngine({ next: () => json(GUIDE), status: () => json(LOCAL), ask: () => json({ error: "off", code: "assist_disabled" }, 404) });
    mount(<AssistChat />);
    await ask("Anything?");
    expect(await screen.findByText(/The assistant is off/)).toBeTruthy();
    expect(screen.queryByLabelText("Your question")).toBeNull();
  });
});

describe("Settings, Assistant", () => {
  it("shows the provider read-only, the index line, and no consent paragraph for a local model", async () => {
    mockEngine({ status: () => json(LOCAL) });
    mount(<AssistantSettings />);
    expect(await screen.findByText("Ollama")).toBeTruthy();
    expect(screen.getByText("On this Mac")).toBeTruthy();
    expect(screen.getByText(/42 passages from your sheets, rounds and results, indexed/)).toBeTruthy();
    expect(screen.queryByTestId("assist-consent")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("shows the consent paragraph only for a cloud provider", async () => {
    mockEngine({ status: () => json(CLOUD) });
    mount(<AssistantSettings />);
    expect(await screen.findByText("Anthropic")).toBeTruthy();
    expect(screen.getByTestId("assist-consent").textContent).toContain("sent to Anthropic");
    expect(screen.getByText("Sent away")).toBeTruthy();
  });

  it("rebuilds the index and shows the new status", async () => {
    mockEngine({ status: () => json({ ...LOCAL, chunks: 0, built_at: null }), rebuild: () => json({ ...LOCAL, chunks: 7, built_at: new Date().toISOString() }) });
    mount(<AssistantSettings />);
    expect(await screen.findByText("Nothing is indexed yet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Rebuild" }));
    expect(await screen.findByText(/7 passages from your sheets, rounds and results, indexed just now/)).toBeTruthy();
    expect((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => String(c[0]).endsWith("/api/assist/index/rebuild") && (c[1] as RequestInit)?.method === "POST")).toBe(true);
  });

  it("says the assistant is off, or that this Kalos has none", async () => {
    mockEngine({ status: () => json({ ...LOCAL, provider: "none", model: null }) });
    const { unmount } = mount(<AssistantSettings />);
    expect(await screen.findByText("The assistant is off.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Rebuild" })).toBeNull();
    unmount();
    mockEngine({});
    mount(<AssistantSettings />);
    expect(await screen.findByText("This version of Kalos has no assistant.")).toBeTruthy();
  });
});
