import { describe, expect, it } from "vitest";
import {
  breadcrumbFor,
  navKeyFor,
  titleFor,
} from "@/lib/routes";

describe("navKeyFor", () => {
  it('returns "campaign" for "/"', () => {
    expect(navKeyFor("/")).toBe("campaign");
  });

  it('returns "campaign" for "/campaign/*"', () => {
    expect(navKeyFor("/campaign/setup")).toBe("campaign");
    expect(navKeyFor("/campaign/plan")).toBe("campaign");
    expect(navKeyFor("/campaign/run")).toBe("campaign");
  });

  it('returns "data" for "/data*"', () => {
    expect(navKeyFor("/data")).toBe("data");
    expect(navKeyFor("/data/foo")).toBe("data");
  });

  it('returns "library" for "/library*"', () => {
    expect(navKeyFor("/library")).toBe("library");
    expect(navKeyFor("/library/vessels")).toBe("library");
  });

  it('returns "projects" for "/projects*"', () => {
    expect(navKeyFor("/projects")).toBe("projects");
    expect(navKeyFor("/projects/abc")).toBe("projects");
  });

  it('returns "settings" for "/settings*"', () => {
    expect(navKeyFor("/settings")).toBe("settings");
    expect(navKeyFor("/settings/abc")).toBe("settings");
  });

  it('falls back to "campaign" for unknown paths', () => {
    expect(navKeyFor("/foo/bar")).toBe("campaign");
    expect(navKeyFor("/unknown")).toBe("campaign");
  });
});

describe("titleFor", () => {
  it('returns "Overview" for "/"', () => {
    expect(titleFor("/")).toBe("Overview");
  });

  it('returns the page label for known CAMPAIGN_STAGES hrefs', () => {
    expect(titleFor("/campaign/setup")).toBe("Setup");
    expect(titleFor("/campaign/plan")).toBe("Plan");
    expect(titleFor("/campaign/run")).toBe("Run");
    expect(titleFor("/campaign/record")).toBe("Record");
    expect(titleFor("/campaign/learn")).toBe("Learn");
  });

  it('returns the page label for known LIBRARY_ITEMS hrefs', () => {
    expect(titleFor("/library/vessels")).toBe("Vessels");
    expect(titleFor("/library/plate")).toBe("Plate analysis");
    expect(titleFor("/library/scale-up")).toBe("Scale-up readout");
    expect(titleFor("/library/simulator")).toBe("Simulator");
  });

  it('returns the section label for section index hrefs', () => {
    expect(titleFor("/data")).toBe("Data");
    expect(titleFor("/library")).toBe("Library");
    expect(titleFor("/projects")).toBe("Client projects"); // LIBRARY_ITEMS overrides NAV_ITEMS
    expect(titleFor("/settings")).toBe("Settings");
  });

  it('capitalizes last segment and replaces hyphens for unknown sub-paths', () => {
    expect(titleFor("/projects/my-thing")).toBe("My thing");
    expect(titleFor("/campaign/unknown-page")).toBe("Unknown page");
  });
});

describe("breadcrumbFor", () => {
  it("returns [section] for a section index", () => {
    const result = breadcrumbFor("/");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ href: "/", label: "Campaign" });
  });

  it("returns [section, page] for a known non-index campaign page", () => {
    const result = breadcrumbFor("/campaign/setup");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ href: "/", label: "Campaign" });
    expect(result[1]).toMatchObject({
      href: "/campaign/setup",
      label: "Setup",
    });
  });

  it("returns [section, page] for a known library page", () => {
    const result = breadcrumbFor("/library/vessels");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ href: "/library", label: "Library" });
    expect(result[1]).toMatchObject({
      href: "/library/vessels",
      label: "Vessels",
    });
  });

  it("returns [section] for unknown sub-paths (falls back to section alone)", () => {
    const result = breadcrumbFor("/projects/my-thing");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      href: "/projects",
      label: "Projects",
    });
  });

  it("returns [section] for data with no sub-pages", () => {
    const result = breadcrumbFor("/data");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ href: "/data", label: "Data" });
  });

  it("returns [section] for settings", () => {
    const result = breadcrumbFor("/settings");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      href: "/settings",
      label: "Settings",
    });
  });
});
