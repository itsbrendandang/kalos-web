// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// IndexedDB is absent in jsdom; keeping a copy of the sheet is fire-and-forget on the page.
vi.mock("@/lib/sheet-store", () => ({ rememberSheet: async () => null }));

import SetupPage from "@/app/campaign/setup/page";
import { EngineDataProvider } from "@/hooks/use-engine";

/*
 * First-time study, F6: the one decision (target, inputs, what each column is) comes first, read from the
 * file in the browser; the charts sit under "Look at the data"; nothing is sent to Kalos until the user
 * presses Build. fetch is the only seam.
 */

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const CSV = ["Row,Strain,Glucose_gL,Titer,Temp_C,Notes", ...Array.from({ length: 12 }, (_, i) => `${i + 1},${["WT", "clone7", "dPEP4"][i % 3]},${20 + (i % 3) * 5},${10 + i * 0.5},${30 + (i % 2) * 2},${i % 4 === 0 ? "foam" : ""}`)].join("\n");

let runs: { roles: unknown; target: string | null }[] = [];
let resolveRun: ((r: Response) => void) | null = null;

beforeEach(() => {
  runs = [];
  resolveRun = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/latest")) return json({ has_data: false });
      if (url.endsWith("/api/campaign")) return json({ has_campaign: false });
      if (url.endsWith("/api/run")) {
        const fd = init?.body as FormData;
        const roles = fd.get("roles");
        runs.push({ roles: roles ? JSON.parse(String(roles)) : null, target: fd.get("target") ? String(fd.get("target")) : null });
        return new Promise<Response>((r) => {
          resolveRun = r;
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function dropSheet() {
  render(
    <EngineDataProvider>
      <SetupPage />
    </EngineDataProvider>,
  );
  await screen.findByRole("heading", { level: 1, name: "Set up the campaign" });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([CSV], "my_messy_sheet.csv", { type: "text/csv" });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
  await screen.findByText("Target to raise");
}

describe("Setup: the decision comes first and the fit waits for it", () => {
  it("shows the target, the inputs and what each column is, read from the file, without calling Kalos", async () => {
    await dropSheet();
    expect(runs).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 2, name: "What to raise, and what Kalos may change" })).toBeTruthy();
    const target = screen.getByLabelText("Target to raise") as HTMLSelectElement;
    expect(target.value).toBe("Titer");
    const tick = (name: string) => screen.getByRole("checkbox", { name: new RegExp(`^${name}\\b`) }) as HTMLInputElement;
    expect(tick("Glucose_gL").checked).toBe(true);
    expect(tick("Strain").checked).toBe(true);
    expect(tick("Temp_C").checked).toBe(true);
    expect(tick("Row").checked).toBe(false);
    expect(tick("Notes").checked).toBe(false);
    expect(screen.getByText(/row numbers 1 to 12 · left out: counts the rows/)).toBeTruthy();
    expect(screen.getByText(/a choice of 3 labels: clone7, dPEP4, WT/)).toBeTruthy();
    // The charts are one click down, under the decision.
    expect(screen.getByText("Look at the data")).toBeTruthy();
    expect(screen.queryByText(/in sheet order/)).toBeNull();
  });

  it("builds the model only on Build, with exactly the ticked columns as explicit roles", async () => {
    await dropSheet();
    fireEvent.click(screen.getByRole("checkbox", { name: /^Temp_C\b/ }));
    const build = screen.getByRole("button", { name: "Build the model with these 2 inputs" });
    expect(runs).toHaveLength(0);
    await act(async () => {
      fireEvent.click(build);
    });
    await waitFor(() => expect(runs).toHaveLength(1));
    expect(runs[0]).toEqual({ target: "Titer", roles: { target: "Titer", features: ["Strain", "Glucose_gL"], categoricals: ["Strain"] } });
    expect(screen.getByText("Learning from your runs")).toBeTruthy();
    act(() => resolveRun?.(json({ has_data: false, error: "Not enough runs", code: "too_few_rows" })));
    await screen.findByText(/Kalos could not read my_messy_sheet.csv/);
  });

  it("changing the target drops it from the inputs and keeps the rest of the choice", async () => {
    await dropSheet();
    fireEvent.change(screen.getByLabelText("Target to raise"), { target: { value: "Glucose_gL" } });
    expect(screen.queryByRole("checkbox", { name: /^Glucose_gL\b/ })).toBeNull();
    expect((screen.getByRole("checkbox", { name: /^Titer\b/ }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(/left out: looks like a measured result/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Build the model with these 2 inputs" })).toBeTruthy();
  });
});
