// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ToolFinder } from "@/components/workbench/tool-finder";

afterEach(cleanup);

describe("bioprocess tool finder", () => {
  it("links directly to existing calculations and campaign planning", () => {
    render(<ToolFinder />);
    expect(screen.getByRole("link", { name: "Predict at a larger scale" }).getAttribute("href")).toBe("/library/scale-up");
    expect(screen.getByRole("link", { name: "Analyze a plate" }).getAttribute("href")).toBe("/library/plate");
    expect(screen.getByRole("link", { name: "Plan experiments" }).getAttribute("href")).toBe("/campaign/plan");
  });

  it("finds the scale-up readout by scientific terminology and ignores punctuation", () => {
    render(<ToolFinder />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "oxygen transfer" } });
    expect(screen.getByRole("link", { name: /Scale-up readout/ }).getAttribute("href")).toBe("/library/scale-up");
    expect(screen.getByRole("status").textContent).toBe("1 tool found");
    fireEvent.change(input, { target: { value: "Scale UP" } });
    expect(screen.getByRole("link", { name: /Scale-up readout/ })).toBeTruthy();
  });

  it("handles no matches honestly and restores suggestions when cleared", () => {
    render(<ToolFinder />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "unknown-calculation" } });
    expect(screen.getByRole("status").textContent).toBe("0 tools found");
    expect(screen.getByRole("link", { name: "browse the library" }).getAttribute("href")).toBe("/library");
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByRole("list", { name: "Suggested tools" })).toBeTruthy();
  });

  it("browses all tools on an empty submit without starting an analysis", () => {
    render(<ToolFinder />);
    fireEvent.submit(screen.getByRole("search"));
    expect(screen.getByRole("list", { name: "Matching tools" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Record/ }).getAttribute("href")).toBe("/campaign/record");
    expect(screen.getByRole("link", { name: /Scale-up readout/ })).toBeTruthy();
  });
});
