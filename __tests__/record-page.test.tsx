// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RecordPage from "@/app/campaign/record/page";
import { EngineDataProvider, useCampaign } from "@/hooks/use-engine";
import type { Campaign, CampaignRun } from "@/lib/api";

const run = (id: string): CampaignRun => ({
  id, recipe: { pH: 7 }, pred: 4, std: 0.2, mode: "exploit", reason: "", result: null, awaiting: true,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let campaign: Extract<Campaign, { has_campaign: true }>;
let refreshFails: boolean;
let writeFails: string | null;
let posts: { id: string; value: number; reason?: string }[];
let holdWrite: Promise<void> | null;

beforeEach(() => {
  campaign = {
    has_campaign: true, target: "titer", features: ["pH"], n_base: 20, best: 5, round: 0,
    history: [], pending: [run("first"), run("second")], n_awaiting: 2, n_measured: 0,
  };
  refreshFails = false;
  writeFails = null;
  posts = [];
  holdWrite = null;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/latest")) return json({ has_data: false });
    if (url.endsWith("/api/campaign")) return refreshFails ? json({}, 503) : json(campaign);
    if (url.endsWith("/api/campaign/result")) {
      const entry = JSON.parse(String(init?.body));
      posts.push(entry);
      if (holdWrite) await holdWrite;
      if (entry.id === writeFails) return json({ error: "Please try again" }, 503);
      if (campaign.pending.some((r) => r.id === entry.id && r.result != null) && !entry.reason?.trim()) {
        return json({ error: "a correction to a recorded result needs a reason", code: "reason_required" }, 400);
      }
      const pending = campaign.pending.map((r) => r.id === entry.id ? { ...r, result: entry.value, awaiting: false } : r);
      campaign = {
        ...campaign, pending,
        n_awaiting: pending.filter((r) => r.awaiting).length,
        n_measured: pending.filter((r) => !r.awaiting).length,
        analysis_in_sync: false,
      };
      return json({ ok: true });
    }
    throw new Error(`unexpected request: ${url}`);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function CampaignSummary() {
  const { data } = useCampaign();
  return <output>{data?.has_campaign ? `${data.n_measured} measured, ${data.n_awaiting} awaiting, analysis ${data.analysis_in_sync ? "current" : "outdated"}` : ""}</output>;
}

async function renderRecord() {
  render(<EngineDataProvider><RecordPage /><CampaignSummary /></EngineDataProvider>);
  await screen.findByRole("textbox", { name: /run first/ });
}

const input = (id: string) => screen.getByRole("textbox", { name: `Measured result for run ${id}` }) as HTMLInputElement;
const reason = (id: string) => screen.getByRole("textbox", { name: `Reason for correction for run ${id}` }) as HTMLInputElement;
const save = () => screen.getByRole("button", { name: /^Save .*result/ }) as HTMLButtonElement;

function seedSaved(id: string, value = 3.5) {
  campaign.pending = campaign.pending.map((r) => r.id === id ? { ...r, result: value, awaiting: false } : r);
  campaign.n_awaiting--;
  campaign.n_measured++;
}

describe("Record save recovery", () => {
  it("keeps acknowledged values visible when the read after a save fails", async () => {
    await renderRecord();
    refreshFails = true;
    fireEvent.change(input("first"), { target: { value: "3.5" } });
    fireEvent.click(save());

    await waitFor(() => expect(save().textContent).not.toContain("Saving"));
    expect(posts).toEqual([{ id: "first", value: 3.5 }]);
    expect(input("first").value).toBe("3.5");
    expect(screen.getByText("Saved")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh results" })).toBeTruthy();
    expect(save().disabled).toBe(true);

    // Unsaved edits survive recovery; fresh server values replace the fallback.
    fireEvent.change(input("second"), { target: { value: "4.2" } });
    refreshFails = false;
    campaign.pending[0].result = 3.6;
    fireEvent.click(screen.getByRole("button", { name: "Refresh results" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Refresh results" })).toBeNull());
    expect(input("first").value).toBe("3.6");
    expect(input("second").value).toBe("4.2");
    expect(save().disabled).toBe(false);
    fireEvent.click(save());
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]).toEqual({ id: "second", value: 4.2 });
  });

  it("does not claim earlier rows were saved when the first write failed", async () => {
    await renderRecord();
    writeFails = "first";
    fireEvent.change(input("first"), { target: { value: "3.5" } });
    fireEvent.click(save());
    await screen.findByText(/could not be saved/);
    expect(screen.queryByText(/Earlier rows were saved/)).toBeNull();
    expect(input("first").value).toBe("3.5");
    expect(save().disabled).toBe(false);
  });

  it("keeps a failed row's draft while preserving earlier successful writes", async () => {
    await renderRecord();
    writeFails = "second";
    fireEvent.change(input("first"), { target: { value: "3.5" } });
    fireEvent.change(input("second"), { target: { value: "4.2" } });
    fireEvent.click(save());
    await screen.findByText(/Earlier rows were saved/);
    expect(input("first").value).toBe("3.5");
    expect(input("second").value).toBe("4.2");
    writeFails = null;
    fireEvent.click(save());
    await waitFor(() => expect(posts).toHaveLength(3));
    expect(posts.map((p) => p.id)).toEqual(["first", "second", "second"]);
  });

  it("retains a whole saved batch through failed reads and counts corrections once", async () => {
    await renderRecord();
    refreshFails = true;
    fireEvent.change(input("first"), { target: { value: "3.5" } });
    fireEvent.change(input("second"), { target: { value: "4.2" } });
    fireEvent.click(save());
    await screen.findByText("2 measured, 0 awaiting, analysis outdated");
    await waitFor(() => expect(save().textContent).not.toContain("Saving"));
    expect(input("first").value).toBe("3.5");
    expect(input("second").value).toBe("4.2");
    expect(screen.getAllByText("Saved")).toHaveLength(2);

    refreshFails = false;
    fireEvent.click(screen.getByRole("button", { name: "Refresh results" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Refresh results" })).toBeNull());
    refreshFails = true;
    fireEvent.change(input("first"), { target: { value: "3.6" } });
    fireEvent.change(reason("first"), { target: { value: "Corrected transcription" } });
    fireEvent.click(save());
    await waitFor(() => expect(input("first").disabled).toBe(false));
    expect(input("first").value).toBe("3.6");
    expect(screen.getByText("2 measured, 0 awaiting, analysis outdated")).toBeTruthy();
    expect(posts).toHaveLength(3);
    expect(posts[2]).toEqual({ id: "first", value: 3.6, reason: "Corrected transcription" });
  });

  it("sends one write when the form is submitted twice before React renders", async () => {
    await renderRecord();
    let release!: () => void;
    holdWrite = new Promise<void>((resolve) => { release = resolve; });
    fireEvent.change(input("first"), { target: { value: "3.5" } });
    act(() => {
      fireEvent.submit(input("first").closest("form")!);
      fireEvent.submit(input("first").closest("form")!);
    });
    expect(posts).toHaveLength(1);
    await act(async () => release());
    await waitFor(() => expect(save().disabled).toBe(true));
    expect(input("first").value).toBe("3.5");
  });
});

describe("Record corrections", () => {
  it("requires a nonblank reason before submitting any rows in a correction batch", async () => {
    seedSaved("first");
    await renderRecord();
    fireEvent.change(input("first"), { target: { value: "3.6" } });
    fireEvent.change(input("second"), { target: { value: "4.2" } });
    expect(reason("first").required).toBe(true);
    expect(reason("first").maxLength).toBe(256);
    expect(save().disabled).toBe(true);
    fireEvent.change(reason("first"), { target: { value: "   " } });
    fireEvent.submit(input("first").closest("form")!);
    expect(posts).toEqual([]);
    expect(save().disabled).toBe(true);

    fireEvent.change(reason("first"), { target: { value: "x".repeat(257) } });
    fireEvent.submit(input("first").closest("form")!);
    expect(posts).toEqual([]);
    expect(save().disabled).toBe(true);
  });

  it("saves a correction with its trimmed reason alongside an initial measurement", async () => {
    seedSaved("first");
    await renderRecord();
    fireEvent.change(input("first"), { target: { value: "3.6" } });
    fireEvent.change(reason("first"), { target: { value: "  Corrected transcription  " } });
    fireEvent.change(input("second"), { target: { value: "4.2" } });
    fireEvent.click(save());

    await screen.findByText("2 measured, 0 awaiting, analysis outdated");
    await waitFor(() => expect(save().textContent).not.toContain("Saving"));
    expect(posts).toEqual([
      { id: "first", value: 3.6, reason: "Corrected transcription" },
      { id: "second", value: 4.2 },
    ]);
    expect(input("first").value).toBe("3.6");
    expect(screen.queryByRole("textbox", { name: /Reason for correction/ })).toBeNull();
    fireEvent.change(input("first"), { target: { value: "3.7" } });
    expect(reason("first").value).toBe("");
    expect(save().disabled).toBe(true);
  });

  it("retains only the unsaved correction and its reason after a partial failure", async () => {
    seedSaved("first");
    seedSaved("second", 4.1);
    writeFails = "second";
    await renderRecord();
    fireEvent.change(input("first"), { target: { value: "3.6" } });
    fireEvent.change(reason("first"), { target: { value: "Corrected transcription" } });
    fireEvent.change(input("second"), { target: { value: "4.2" } });
    fireEvent.change(reason("second"), { target: { value: "Rechecked instrument reading" } });
    fireEvent.click(save());

    await screen.findByText(/Earlier rows were saved/);
    expect(input("first").value).toBe("3.6");
    expect(screen.queryByRole("textbox", { name: "Reason for correction for run first" })).toBeNull();
    expect(input("second").value).toBe("4.2");
    expect(reason("second").value).toBe("Rechecked instrument reading");

    writeFails = null;
    fireEvent.click(save());
    await waitFor(() => expect(save().disabled).toBe(true));
    expect(posts.map((p) => p.id)).toEqual(["first", "second", "second"]);
    expect(posts[2]).toEqual({ id: "second", value: 4.2, reason: "Rechecked instrument reading" });
    expect(input("second").value).toBe("4.2");
  });

  it("retains a rejected correction and its reason through a refresh failure", async () => {
    seedSaved("second");
    writeFails = "second";
    refreshFails = false;
    await renderRecord();
    fireEvent.change(input("first"), { target: { value: "4.1" } });
    fireEvent.change(input("second"), { target: { value: "3.6" } });
    fireEvent.change(reason("second"), { target: { value: "Corrected transcription" } });
    refreshFails = true;
    fireEvent.click(save());
    await screen.findByText(/Earlier rows were saved/);
    expect(reason("second").value).toBe("Corrected transcription");
    expect(save().disabled).toBe(true);

    refreshFails = false;
    writeFails = null;
    fireEvent.click(screen.getByRole("button", { name: "Refresh results" }));
    await waitFor(() => expect(save().disabled).toBe(false));
    expect(input("second").value).toBe("3.6");
    expect(reason("second").value).toBe("Corrected transcription");
    fireEvent.click(save());
    await waitFor(() => expect(posts).toHaveLength(3));
    expect(posts[2]).toEqual({ id: "second", value: 3.6, reason: "Corrected transcription" });
  });

  it("keeps the reason when reviewing an unusual correction, then sends it on confirmation", async () => {
    seedSaved("first");
    await renderRecord();
    fireEvent.change(input("first"), { target: { value: "-1" } });
    fireEvent.change(reason("first"), { target: { value: "Blank-corrected reading" } });
    fireEvent.click(save());
    expect(posts).toEqual([]);
    fireEvent.click(await screen.findByRole("button", { name: "Review values" }));
    expect(reason("first").value).toBe("Blank-corrected reading");
    fireEvent.click(save());
    fireEvent.click(await screen.findByRole("button", { name: "Save as entered" }));
    await waitFor(() => expect(input("first").value).toBe("-1"));
    await waitFor(() => expect(save().disabled).toBe(true));
    expect(posts).toEqual([{ id: "first", value: -1, reason: "Blank-corrected reading" }]);
  });

  it("needs no reason or write when an edit is reverted to the saved value", async () => {
    seedSaved("first");
    await renderRecord();
    expect(screen.queryByRole("textbox", { name: /Reason for correction/ })).toBeNull();
    fireEvent.change(input("first"), { target: { value: "3.6" } });
    expect(reason("first")).toBeTruthy();
    fireEvent.change(input("first"), { target: { value: "3.5" } });
    expect(screen.queryByRole("textbox", { name: /Reason for correction/ })).toBeNull();
    expect(save().disabled).toBe(true);
    fireEvent.submit(input("first").closest("form")!);
    expect(posts).toEqual([]);
  });
});
