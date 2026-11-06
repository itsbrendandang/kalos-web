// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuditPage from "@/app/settings/audit/page";
import { relativeTime } from "@/app/settings/audit/relative-time";
import SettingsPage from "@/app/settings/page";
import { EngineDataProvider } from "@/hooks/use-engine";

/*
 * The change history is labelled as a local activity log, not an audit trail for regulated
 * records. The storage details sit behind a disclosure; the page never claims to be
 * tamper-evident or a validated record.
 */

beforeEach(() => {
  localStorage.clear();
  // The file route is not there in the hosted case, so the page reads the browser copy.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("activity log page", () => {
  it("is titled and described as a local activity log, with the regulated-records limit one click down", async () => {
    render(<AuditPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Local activity log" })).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/A local log, not an audit trail/);
    expect(text).toMatch(/No entries yet/);
    expect(text).not.toMatch(/Change history/);
    expect(text).not.toMatch(/tamper|GxP|validated/i);
    // The storage details open on demand.
    const details = document.querySelector("details");
    expect(details?.textContent).toMatch(/Where this is kept/);
    details!.open = true;
    details!.dispatchEvent(new Event("toggle"));
    expect(await screen.findByText(/not an audit trail for regulated records and has no electronic signatures/)).toBeTruthy();
  });

  it("the settings card links to it as an activity log", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    render(
      <EngineDataProvider>
        <SettingsPage />
      </EngineDataProvider>,
    );
    expect(screen.getByRole("heading", { name: "Activity log" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View activity log" }).getAttribute("href")).toBe("/settings/audit");
    expect(document.body.textContent ?? "").not.toMatch(/Change history/);
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-01-10T12:00:00Z");
  it("says it in plain words", () => {
    expect(relativeTime("2026-01-10T11:59:50Z", now)).toBe("just now");
    expect(relativeTime("2026-01-10T11:59:00Z", now)).toBe("1 minute ago");
    expect(relativeTime("2026-01-10T11:30:00Z", now)).toBe("30 minutes ago");
    expect(relativeTime("2026-01-10T09:00:00Z", now)).toBe("3 hours ago");
    expect(relativeTime("2026-01-08T12:00:00Z", now)).toBe("2 days ago");
  });
});
