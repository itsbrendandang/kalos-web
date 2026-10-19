import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Static-markup checks for the editor tab strip: a tablist may own only tab
// elements, so the strip is a nav of links. The same markup is run through
// axe-core in a real browser (docs/ACCESSIBILITY.md).

vi.mock("next/navigation", () => ({
  usePathname: () => "/library/plate",
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("editor tab strip structure", () => {
  it("has no tablist, no tab roles, and marks the current page with aria-current", async () => {
    const { EditorTabs } = await import("@/components/workbench/editor-tabs");
    const html = renderToStaticMarkup(<EditorTabs titleFor={(h) => `title ${h}`} />);
    expect(html).not.toMatch(/role="tablist"/);
    expect(html).not.toMatch(/role="tab"/);
    expect(html).toMatch(/<nav[^>]*aria-label="Open pages"/);
    expect(html).toMatch(/<a[^>]*href="\/library\/plate"[^>]*aria-current="page"/);
  });

  it("only lists <li> children under the list, and every close button has a name", async () => {
    const { EditorTabs } = await import("@/components/workbench/editor-tabs");
    const html = renderToStaticMarkup(<EditorTabs titleFor={(h) => `title ${h}`} />);
    const ulBody = html.match(/<ul[^>]*>([\s\S]*)<\/ul>/)?.[1] ?? "";
    // Direct children of the list are li elements only (no div wrappers, no buttons).
    const topLevel = ulBody.replace(/<li[\s\S]*?<\/li>/g, "");
    expect(topLevel.trim()).toBe("");
    const closeButtons = html.match(/<button[^>]*>/g) ?? [];
    for (const b of closeButtons) expect(b).toMatch(/aria-label="Close /);
  });
});

