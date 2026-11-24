// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AssistantPanel } from "@/components/shell/assistant-panel";

const CMP = "cmp_0123456789abcdef0123456789abcdef";
const nav = vi.hoisted(() => ({ pathname: "/campaigns/cmp_0123456789abcdef0123456789abcdef" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: vi.fn() }) }));
const ctx = vi.hoisted(() => ({ value: { campaignId: "cmp_0123456789abcdef0123456789abcdef", campaign: { data: null }, latest: { data: null } } as unknown }));
vi.mock("@/hooks/use-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-engine")>()),
  useOptionalCampaignData: () => ctx.value,
}));

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const fail = (status: number, body: unknown) => ({ ok: false, status, json: async () => body, headers: new Headers() }) as unknown as Response;

const NEXT = {
  state: "runs_awaiting",
  step: "Record 3 results for round 2",
  why: "2 of 5 started runs have a result.",
  why_it_matters: "Every result sharpens the next suggestions.",
  action_route: "/campaign/record",
  blockers: [
    { code: "w", text: "Warning: controls present." },
    { code: "w", text: "Warning: controls present." },
  ],
  campaign_id: CMP,
};

describe("AssistantPanel", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/assist/next")) return ok(NEXT);
      if (url.includes("/search")) return ok({ campaign_id: CMP, retriever: "keyword", n_documents: 9, hits: [{ kind: "row", id: "row:4", title: "Row 4", text: "pH 7.1, titer 6.2", score: 1 }] });
      return fail(404, { detail: "Not Found" });
    });
    vi.stubGlobal("fetch", fetchMock);
    nav.pathname = `/campaigns/${CMP}`;
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("is a labelled landmark with the engine's next step, blockers said once, and a link to the step's page", async () => {
    render(<AssistantPanel />);
    expect(screen.getByRole("complementary", { name: "Assistant" })).toBeTruthy();
    expect(await screen.findByText("Record 3 results for round 2")).toBeTruthy();
    expect(screen.getAllByText("Warning: controls present.")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Go there/ }).getAttribute("href")).toBe(`/campaigns/${CMP}/validate#record`);
    expect(fetchMock.mock.calls[0][0]).toContain(`/api/assist/next?campaign_id=${CMP}`);
  });

  it("drops the link on the page the step lives on", async () => {
    nav.pathname = `/campaigns/${CMP}/validate`;
    render(<AssistantPanel />);
    await screen.findByText("Record 3 results for round 2");
    expect(screen.queryByRole("link", { name: /Go there/ })).toBeNull();
  });

  it("hides the step on an engine without the guide", async () => {
    fetchMock.mockImplementation(async () => fail(404, { detail: "Not Found" }));
    render(<AssistantPanel />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/next step could not be loaded/)).toBeNull());
    expect(screen.queryByRole("region", { name: "Next step" })).toBeNull();
  });

  it("searches this campaign and says results are records, not generated text", async () => {
    render(<AssistantPanel />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "high pH" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(await screen.findByText("pH 7.1, titer 6.2")).toBeTruthy();
    expect(screen.getByText(/nothing here is generated/)).toBeTruthy();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes(`/api/campaigns/${CMP}/search?q=high+pH`))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Clear the search" }));
    expect(screen.queryByText("pH 7.1, titer 6.2")).toBeNull();
  });

  it("renders nothing outside a campaign", () => {
    ctx.value = null;
    const { container } = render(<AssistantPanel />);
    expect(container.innerHTML).toBe("");
  });
});
