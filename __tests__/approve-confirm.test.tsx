// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import latestFixture from "./fixtures/plan-latest.json";
import campaignFixture from "./fixtures/plan-campaign.json";
import surfaceMock from "./fixtures/plan-response-surface.json";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import PlanPage from "@/app/campaign/plan/page";
import { ViewerProvider } from "@/components/auth/viewer";
import { EngineDataProvider } from "@/hooks/use-engine";
import type { Viewer } from "@/lib/viewer";

/*
 * Item 2: the approve step lists what will start and where it came from (only engine fields), names the
 * approver, and claims no signature. The latest fixture has no `run` block, so the provenance rows read
 * "Not available" there; the richer case adds the engine's own fields.
 */

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const withRun = {
  ...latestFixture,
  engine_version: "0.9.1-test",
  seed: 42,
  run: {
    kind: "upload",
    input_sha256: "ab".repeat(32),
    build_sha: "deadbeefcafe1234abcd",
    seed: 42,
    library_versions: { numpy: "1.26.4", pandas: "2.2.1", torch: null },
  },
};

let latest: unknown;

beforeEach(() => {
  latest = latestFixture;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/latest")) return json(latest);
      if (url.endsWith("/api/campaign")) return json(campaignFixture);
      if (url.includes("/response-surface") || url.endsWith("/api/response-surface")) return json(surfaceMock);
      if (url.endsWith("/api/campaign/start")) return json({ ok: true });
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openDialog(viewer: Viewer) {
  render(
    <ViewerProvider viewer={viewer}>
      <EngineDataProvider>
        <PlanPage />
      </EngineDataProvider>
    </ViewerProvider>,
  );
  await screen.findByRole("heading", { level: 1, name: "Plan round 1" });
  fireEvent.click(screen.getAllByRole("button", { name: /^Start these \d+ runs?$/ })[0]);
  const dialog = within(await screen.findByRole("dialog"));
  // The engine's names (version, build, seed, SHA-256) sit behind a disclosure; open it so the rows can be read.
  fireEvent.click(dialog.getByText("What these runs were built from"));
  await dialog.findByText("Model version");
  return dialog;
}

describe("approve confirmation", () => {
  it("names the signed-in user and lists the engine's provenance fields", async () => {
    latest = withRun;
    const dialog = await openDialog({ kind: "signed-in", name: "Ada Lovelace", email: "ada@example.com" });
    expect(dialog.getByText("You are approving as Ada Lovelace.")).toBeTruthy();
    expect(dialog.getByText("Recipes that will start")).toBeTruthy();
    expect(dialog.getByText("0.9.1-test")).toBeTruthy();
    expect(dialog.getByText("deadbeefcafe1234abcd")).toBeTruthy();
    expect(dialog.getByText("42")).toBeTruthy();
    expect(dialog.getByText("ab".repeat(32))).toBeTruthy();
    expect(dialog.getByText("numpy 1.26.4, pandas 2.2.1")).toBeTruthy();
    // The engine reports no model version: the row says so, it is never filled in.
    expect(dialog.getByText("Model version").nextElementSibling?.textContent).toBe("Not available");
  });

  it("marks every field the engine did not send as not available", async () => {
    latest = latestFixture;
    const dialog = await openDialog({ kind: "signed-in", name: "Ada Lovelace", email: "ada@example.com" });
    expect(dialog.getByText("Engine build").nextElementSibling?.textContent).toBe("Not available");
    expect(dialog.getByText("Input fingerprint (SHA-256)").nextElementSibling?.textContent).toBe("Not available");
    expect(dialog.getByText("Fit seed").nextElementSibling?.textContent).toBe("Not available");
  });

  it("says plainly that local mode has no sign-in, and makes no signature claim", async () => {
    latest = withRun;
    const dialog = await openDialog({ kind: "local" });
    expect(dialog.getByText(/Local mode, no sign-in/)).toBeTruthy();
    expect(dialog.queryByText(/this device/i)).toBeNull();
    const text = (await screen.findByRole("dialog")).textContent ?? "";
    expect(text).not.toMatch(/electronic|e-sign|signature|signed (by|record)/i);
    expect(text).not.toMatch(/design space|GMP|validated|compliant/i);
  });

  it("keeps one primary action: Start, behind the confirmation tick", async () => {
    latest = withRun;
    const dialog = await openDialog({ kind: "signed-in", name: "Ada Lovelace", email: null });
    const start = dialog.getByRole("button", { name: /^Start 5 runs/ }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    fireEvent.click(dialog.getByRole("checkbox"));
    expect(start.disabled).toBe(false);
  });
});
