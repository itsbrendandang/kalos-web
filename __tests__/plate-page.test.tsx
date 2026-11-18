// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/components/kit/lazy-chart", () => ({ lazyChart: () => () => null }));
import PlatePage from "@/app/library/plate/page";

afterEach(cleanup);

it("never attributes Plate 01 measurements to the unavailable Plate 02", () => {
  render(<TooltipProvider><PlatePage /></TooltipProvider>);
  expect(screen.getByRole("heading", { name: /96-well plate heatmap/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Plate 02" }));
  expect(screen.getByRole("button", { name: "Plate 02" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("No data for Plate 02")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: /96-well plate heatmap/ })).toBeNull();
  expect(screen.queryByText("Wells with data")).toBeNull();
  expect(screen.getByRole("button", { name: "Export plate report" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Return to Plate 01" }));
  expect(screen.getByRole("button", { name: "Plate 01" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("heading", { name: /96-well plate heatmap/ })).toBeTruthy();
});
