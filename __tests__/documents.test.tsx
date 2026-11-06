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
const push = vi.fn();
const draftId = "sop_" + "1".repeat(32);
vi.mock("next/navigation", () => ({ usePathname: () => "/documents", useRouter: () => ({ push }), useParams: () => ({ id: draftId }) }));

import DocumentsPage from "@/app/documents/page";
import DocumentPage from "@/app/documents/[id]/page";
import { AssistChat } from "@/components/assist/assist-chat";
import { AssistProvider } from "@/hooks/use-assist";
import { EngineDataProvider } from "@/hooks/use-engine";
import type { SopDraft } from "@/lib/sop";

/*
 * Procedure drafts against a mocked engine: the list, the editor (header
 * always shown, numbers from records with their links, placeholders as
 * inputs saved as a new version), a refused revision with its plain reason,
 * and the draft dialog opened from a "write an SOP for round 1" question.
 */

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const HEADER = "> Draft prepared with Kalos from campaign records on 2026-05-01. Not reviewed. Not an approved procedure.";

const DRAFT: SopDraft = {
  draft_id: draftId,
  version: 1,
  title: "Run recipe 2 of round 1",
  template: "batch_recipe",
  campaign_id: "cmp_x",
  created_at: "2026-05-01T10:00:00Z",
  sha256: "ab".repeat(32),
  model: null,
  source_ids: ["proposal:1.1", "analysis:target"],
  markdown: `${HEADER}\n\n# Run recipe 2 of round 1\n\n## Steps\n1. Set SP to **6.57 g/L**.\n2. Run until [[TO FILL: run_duration_h]] hours have passed.\n3. Prepared by [[TO FILL: prepared_by]].\n`,
  fields_from_record: [{ section: "Steps", field: "SP", value: "6.57 g/L", source_id: "proposal:1.1" }],
  placeholders: [
    { name: "run_duration_h", section: "Steps", why: "Run length is not in your records." },
    { name: "prepared_by", section: "Steps", why: "A person, not Kalos, prepares the run." },
  ],
  filled: [],
};
const LOCAL = { provider: "ollama", model: "qwen2.5:7b", local: true, chunks: 1, built_at: "2026-05-01T09:00:00Z", building: false };

type Engine = { drafts?: SopDraft[]; revise?: (body: unknown) => Response; fill?: (body: unknown) => Response; draft?: (body: unknown) => Response };
let engine: Engine;
let posts: { url: string; body: unknown }[];

function mockEngine(e: Engine) {
  engine = e;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (init?.method === "POST") posts.push({ url, body });
      if (url.endsWith("/api/latest")) return json(latestFixture);
      if (url.endsWith("/api/campaign")) return json(campaignFixture);
      if (url.endsWith("/api/campaigns")) return json({ campaigns: [{ id: "cmp_default", name: "Default", created_at: 0, updated_at: 0, archived: false, is_default: true }] });
      if (url.endsWith("/api/assist/next")) return json({ error: "not found", code: "not_found" }, 404);
      if (url.endsWith("/api/assist/index/status")) return json(LOCAL);
      if (url.endsWith("/api/assist/sop")) {
        return json({ drafts: (engine.drafts ?? []).map((d) => ({ draft_id: d.draft_id, title: d.title, template: d.template, campaign_id: d.campaign_id, latest_version: d.version, source_ids: d.source_ids, created_at: d.created_at, updated_at: d.created_at })) });
      }
      if (url.endsWith("/api/assist/sop/draft")) return engine.draft?.(body) ?? json({ error: "not found", code: "not_found" }, 404);
      if (url.includes(`/api/assist/sop/${draftId}/revise`)) return engine.revise!(body);
      if (url.includes(`/api/assist/sop/${draftId}/fill`)) return engine.fill!(body);
      if (url.includes(`/api/assist/sop/${draftId}`)) {
        const found = (engine.drafts ?? []).find((d) => d.draft_id === draftId);
        return found ? json(found) : json({ error: "draft not found", code: "not_found" }, 404);
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
}

const mount = (ui: ReactNode) =>
  render(
    <EngineDataProvider>
      <AssistProvider>{ui}</AssistProvider>
    </EngineDataProvider>,
  );

beforeEach(() => {
  posts = [];
  push.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Documents", () => {
  it("lists every draft with its version, date, what it was written from, and downloads", async () => {
    mockEngine({ drafts: [DRAFT] });
    mount(<DocumentsPage />);
    const row = (await screen.findByText("Run recipe 2 of round 1")).closest("tr")!;
    expect(within(row).getByRole("link", { name: "Run recipe 2 of round 1" }).getAttribute("href")).toBe(`/documents/${draftId}`);
    expect(row.textContent).toContain("Recipe 2 of round 1, Model results: target");
    expect(within(row).getByText("1")).toBeTruthy();
    expect(within(row).getByRole("link", { name: ".md" }).getAttribute("href")).toContain(`/api/assist/sop/${draftId}/export?format=md`);
    expect(within(row).getByRole("link", { name: ".docx" }).getAttribute("href")).toContain("format=docx");
  });

  it("says plainly when there are no drafts, and when this Kalos cannot write them", async () => {
    mockEngine({ drafts: [] });
    const { unmount } = mount(<DocumentsPage />);
    expect(await screen.findByText("No drafts yet")).toBeTruthy();
    unmount();
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "not found", code: "not_found" }, 404)));
    mount(<DocumentsPage />);
    expect(await screen.findByText("This version of Kalos cannot write procedure drafts yet.")).toBeTruthy();
  });
});

describe("a draft", () => {
  it("always shows the header, renders the draft with placeholders marked, links each number to its record, and lists what the lab fills in", async () => {
    mockEngine({ drafts: [DRAFT] });
    mount(<DocumentPage />);
    expect(await screen.findByText("Draft prepared with Kalos from campaign records on 2026-05-01. Not reviewed. Not an approved procedure.")).toBeTruthy();
    expect(screen.getByText("This line stays on every version and every download. It cannot be edited.")).toBeTruthy();
    const article = screen.getByRole("article", { name: "The draft" });
    expect(within(article).queryByText(/Draft prepared with Kalos/)).toBeNull();
    expect(within(article).getByText("6.57 g/L")).toBeTruthy();
    const marks = article.querySelectorAll("mark[data-placeholder]");
    expect([...marks].map((m) => m.getAttribute("data-placeholder"))).toEqual(["run_duration_h", "prepared_by"]);
    expect(marks[0].textContent).toBe("Run duration h");
    const numbers = screen.getByRole("region", { name: "Numbers taken from your records" });
    expect(within(numbers).getByText("6.57 g/L")).toBeTruthy();
    expect(within(numbers).getByRole("link", { name: "Recipe 2 of round 1" }).getAttribute("href")).toBe("/campaign/plan");
    expect(screen.getByLabelText(/Run duration h/)).toBeTruthy();
    expect(screen.getByText("Run length is not in your records.")).toBeTruthy();
    expect(screen.getByText("Written from your records with no model involved.")).toBeTruthy();
  });

  it("saves typed values as a new version and shows the version that came back", async () => {
    const v2: SopDraft = { ...DRAFT, version: 2, markdown: DRAFT.markdown.replace("[[TO FILL: prepared_by]]", "A. Scientist"), placeholders: [DRAFT.placeholders[0]], filled: [{ name: "prepared_by", section: "Steps", value: "A. Scientist", filled_by: "local user" }] };
    mockEngine({ drafts: [DRAFT], fill: () => json(v2) });
    mount(<DocumentPage />);
    const input = await screen.findByLabelText(/Prepared by/);
    fireEvent.change(input, { target: { value: "A. Scientist" } });
    fireEvent.click(screen.getByRole("button", { name: "Save this value as a new version" }));
    expect(await screen.findByText(/version 2 of 2/)).toBeTruthy();
    expect(posts.find((p) => p.url.endsWith("/fill"))?.body).toEqual({ values: { prepared_by: "A. Scientist" } });
    expect(screen.queryByLabelText(/Prepared by/)).toBeNull();
    expect(screen.getByRole("article", { name: "The draft" }).textContent).toContain("Prepared by A. Scientist");
  });

  it("refuses a value the engine would refuse before sending it", async () => {
    mockEngine({ drafts: [DRAFT] });
    mount(<DocumentPage />);
    const input = await screen.findByLabelText(/Prepared by/);
    fireEvent.change(input, { target: { value: "[[me]]" } });
    expect(screen.getByText("Square brackets are not allowed here.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save as a new version" }).hasAttribute("disabled")).toBe(true);
  });

  it("shows the plain reason when the model's revision was refused, and keeps the draft as it was", async () => {
    mockEngine({ drafts: [DRAFT], revise: () => json({ error: "revision refused", code: "revision_refused", reasons: ["That would change a number taken from your records."] }, 422) });
    mount(<DocumentPage />);
    const input = await screen.findByLabelText("Tell Kalos what to change in the wording");
    fireEvent.change(input, { target: { value: "set SP to 7" } });
    fireEvent.click(screen.getByRole("button", { name: "Change the wording" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Kalos did not keep that change. That would change a number taken from your records.");
    expect(screen.getByText(/version 1 of 1/)).toBeTruthy();
  });

  it("shows the reworded version with the model named", async () => {
    const v2: SopDraft = { ...DRAFT, version: 2, model: "qwen2.5:7b", markdown: DRAFT.markdown.replace("## Steps", "## Steps\nWork with care.") };
    mockEngine({ drafts: [DRAFT], revise: () => json(v2) });
    mount(<DocumentPage />);
    const input = await screen.findByLabelText("Tell Kalos what to change in the wording");
    fireEvent.change(input, { target: { value: "add a care line" } });
    fireEvent.click(screen.getByRole("button", { name: "Change the wording" }));
    expect(await screen.findByText(/version 2 of 2/)).toBeTruthy();
    expect(screen.getByText("This version's wording was changed by the model (qwen2.5:7b). The numbers were not.")).toBeTruthy();
    expect(posts.find((p) => p.url.endsWith("/revise"))?.body).toEqual({ instruction: "add a care line" });
  });

  it("says when the address names no draft", async () => {
    mockEngine({ drafts: [] });
    mount(<DocumentPage />);
    expect(await screen.findByText("No such draft")).toBeTruthy();
  });
});

describe("the draft dialog", () => {
  it("opens from a 'write an SOP for round 1' question with that round picked, and sends the source and template", async () => {
    mockEngine({ drafts: [], draft: () => json({ ...DRAFT, draft_id: "sop_" + "2".repeat(32) }, 201) });
    mount(<AssistChat />);
    const input = await screen.findByLabelText("Your question");
    fireEvent.change(input, { target: { value: "write an SOP for recipe 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Draft a procedure")).toBeTruthy();
    const select = within(dialog).getByLabelText("Written from") as HTMLSelectElement;
    expect(select.value).toBe("proposal:1");
    expect(within(dialog).getByLabelText(/Run a recipe/)).toBeTruthy();
    fireEvent.click(within(dialog).getByLabelText(/Prepare media/));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Write the draft" }));
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/documents/sop_${"2".repeat(32)}`));
    expect(posts.find((p) => p.url.endsWith("/sop/draft"))?.body).toEqual({ campaign_id: "cmp_default", source: { proposal_index: [1] }, template: "media_prep" });
    // The question was not sent to /ask.
    expect(posts.some((p) => p.url.endsWith("/api/assist/ask"))).toBe(false);
  });
});
