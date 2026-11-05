// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuditPage from "@/app/settings/audit/page";
import SettingsPage from "@/app/settings/page";
import { EngineDataProvider } from "@/hooks/use-engine";

/*
 * Item 4: the change history is labelled as a local activity log, not an audit trail for regulated
 * records. The existing disclaimers (tamper-evident, not tamper-proof; not an electronic-signature or
 * validated GxP record) stay.
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
  it("is titled and described as a local activity log, with the regulated-records limit", async () => {
    render(<AuditPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Local activity log" })).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/local activity log, not an audit trail for regulated records/);
    expect(text).toMatch(/tamper-evident, not tamper-proof/);
    expect(text).toMatch(/not an electronic-signature or validated GxP record/);
    expect(text).not.toMatch(/Change history/);
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
