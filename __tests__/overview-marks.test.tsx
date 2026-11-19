// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MeasuredMark, PredictedMark } from "@/components/campaign/plan/marks";

describe("origin marks", () => {
  it("keeps the default plan marks on the violet ring and the ink dot", () => {
    const predicted = renderToStaticMarkup(<PredictedMark />);
    const measured = renderToStaticMarkup(<MeasuredMark />);
    expect(predicted).toContain("var(--chart-predicted)");
    expect(predicted).toContain("<circle");
    expect(predicted).not.toContain("<path");
    expect(measured).toContain("var(--chart-measured)");
    expect(measured).not.toContain("overview-measured");
  });

  it("uses a hollow diamond and a solid measured dot only when asked", () => {
    const predicted = renderToStaticMarkup(<PredictedMark ink="neutral" />);
    const measured = renderToStaticMarkup(<MeasuredMark ink="neutral" />);
    expect(predicted).toContain("<path");
    expect(predicted).toContain("var(--overview-predicted, var(--fg-muted))");
    expect(predicted).not.toContain("var(--chart-predicted)");
    expect(measured).toContain("var(--overview-measured, var(--chart-measured))");
  });
});
