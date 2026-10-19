import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/campaign/plan",
  useRouter: () => ({ push: () => {} }),
}));

import { PageHeader } from "@/components/kit/page-header";
import { Checkbox } from "@/components/ui/checkbox";
import { EditorTabs } from "@/components/workbench/editor-tabs";
import { documentTitle, routeMetadata } from "@/lib/route-metadata";
import { CAMPAIGN_STAGES, LIBRARY_ITEMS, titleFor } from "@/lib/routes";

const read = (f: string) => readFileSync(path.resolve(__dirname, "..", f), "utf8");

describe("PageHeader", () => {
  const html = renderToStaticMarkup(<PageHeader title="Setup" description="d" action={<button>Go</button>} />);
  it("stacks on mobile and goes side by side from sm", () => {
    expect(html).toMatch(/<header class="[^"]*\bflex-col\b[^"]*\bsm:flex-row\b/);
    expect(html.match(/<header class="([^"]*)"/)![1]).not.toContain("flex-wrap");
  });
  it("gives the action the full width on mobile", () => {
    expect(html).toMatch(/class="[^"]*\bw-full\b[^"]*\bsm:w-auto\b[^"]*"><button/);
  });
});

describe("EditorTabs ARIA", () => {
  const html = renderToStaticMarkup(<EditorTabs titleFor={titleFor} panelId="main" />);
  const list = html.slice(html.indexOf('role="tablist"'), html.indexOf("</div>", html.indexOf('role="tablist"')));
  it("the tablist's children are all role=tab", () => {
    const buttons = list.match(/<button\b[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect(b).toContain('role="tab"');
    expect(list).not.toContain("aria-label=\"Close");
  });
  it("close controls sit outside the tablist, ordered after their tab", () => {
    expect(html.slice(html.indexOf("</div>", html.indexOf('role="tablist"')))).toContain('aria-label="Close Plan"');
  });
  it("close buttons are at least 24px wide and tall", () => {
    expect(html).toMatch(/aria-label="Close Plan"[^>]*class="[^"]*\bh-full\b[^"]*\bw-7\b/);
    expect(html).toMatch(/\bsize-6\b[^>]*><svg/);
  });
});

describe("Checkbox", () => {
  const html = renderToStaticMarkup(<Checkbox defaultChecked aria-label="x" />);
  it("keeps a native input as a 24px target and a token border", () => {
    expect(html).toContain('type="checkbox"');
    expect(html).toMatch(/<input[^>]*class="[^"]*\bsize-6\b/);
    expect(html).toContain("border-border-input");
  });
});

describe("control borders use --border-input", () => {
  it.each(["components/ui/input.tsx", "components/ui/select.tsx", "components/ui/checkbox.tsx"])("%s", (f) => {
    const src = read(f);
    expect(src).toContain("border-border-input");
    expect(src).not.toContain("border-border-strong");
  });
});

describe("accessible names start with the visible text", () => {
  it("no aria-label on the upload zone, runs-table recipe toggle or explorer leaves", () => {
    expect(read("components/campaign/upload-zone.tsx")).not.toContain("aria-label=");
    expect(read("components/upload-dropzone.tsx")).not.toContain("Upload a run sheet (CSV");
    expect(read("components/campaign/runs-table.tsx")).not.toContain("Full recipe for run");
    const tree = read("components/workbench/explorer-tree.tsx");
    expect(tree).not.toContain("aria-label={n.name}");
  });
  it("search button label leads with the shortcut shown on it", () => {
    expect(read("components/workbench/app-shell.tsx")).toContain("aria-label={`${shortcut} Search pages and actions`}");
  });
});

describe("plate wells", () => {
  it("every well button carries a name", () => {
    expect(read("components/plate/plate-heatmap.tsx")).toMatch(/sr-only[^]*Well \{id\}/);
  });
});

describe("page titles", () => {
  it("come from titleFor", () => {
    expect(documentTitle("/campaign/plan")).toBe("Plan \u00b7 Kalos");
    expect(routeMetadata("/library/plate")).toEqual({ title: { absolute: "Plate analysis \u00b7 Kalos" } });
  });
  it("every static route has a layout with its title, except Overview and Setup (client title)", () => {
    const routes = ["/data", "/settings", "/library", ...LIBRARY_ITEMS.map((i) => i.href).filter((h) => h.startsWith("/library/")), ...CAMPAIGN_STAGES.map((s) => s.href).filter((h) => h !== "/campaign/setup")];
    for (const r of routes) expect(read(`app${r}/layout.tsx`), r).toContain(`routeMetadata("${r}")`);
  });
});

describe("reduced motion", () => {
  it("globals.css has a prefers-reduced-motion block", () => {
    expect(read("app/globals.css")).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^]*transition-duration/);
  });
});
