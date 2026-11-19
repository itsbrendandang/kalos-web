// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReadoutReport } from "@/components/scale/readout-result";
import { ScaleTrack, stageVolume } from "@/components/scale/scale-track";

const kv = (k: string, v: string) => `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`;
const PAGE = `<!doctype html><html><body>
<p class="timestamp">Generated 2026-11-19 03:50:04 UTC</p>
<div class="banner banner-number"><span class="banner-headline">Prediction issued</span><span class="banner-machine">NUMBER</span></div>
<h2>Prediction</h2>${kv("Predicted titer_g_per_L at 7500 L", "5.659")}${kv("Interval (approximate coverage) for titer_g_per_L at 7500 L", "[5.143, 6.176]")}
<h2>Backtest ladder</h2><table><thead><tr><th>Scale</th><th>Step ratio</th><th>n</th><th>MAE</th><th>naive_mean MAE</th><th>naive_nn MAE</th><th>beats both</th></tr></thead>
<tbody><tr><td>0.25 L</td><td>3.33x</td><td>10</td><td>0.126</td><td>0.568</td><td>0.736</td><td>yes</td></tr>
<tr><td>5000 L</td><td>1.67x</td><td>10</td><td>0.204</td><td>1.101</td><td>0.52</td><td>yes</td></tr></tbody></table>
<h2>Step ratio</h2>${kv("Reference (backtested) ratio", "3.33x")}${kv("Requested (target) ratio", "1.50x")}
<h2>Baseline comparison (pooled ladder residuals)</h2>${kv("Model MAE", "0.263")}${kv("naive_mean MAE", "0.699")}${kv("naive_nn MAE", "0.729")}${kv("beats both baselines", "yes")}${kv("pooled residuals (n)", "70")}
<h2>Provenance</h2>${kv("engine version", "0.1.0")}${kv("alpha", "0.1")}
</body></html>`;

afterEach(cleanup);

describe("scale-up readout numbers through lib/num", () => {
  it("prints the prediction at the band's precision, predicted styling, with the engine's interval label and no invented coverage", () => {
    const { container } = render(<ReadoutReport html={PAGE} fileName="ladder.csv" onEdit={() => {}} onReset={() => {}} />);
    const text = (container.textContent ?? "").replace(/\u00A0/g, " ");
    expect(text).toContain("5.7");
    expect(text).toContain("[5.1, 6.2]");
    expect(text).toContain("7,500 L");
    expect(text).toContain("approximate coverage");
    expect(text).not.toMatch(/calibrated/i);
    expect(text).not.toMatch(/\b(90|95)%/);
    // A predicted number never uses the metric size.
    expect(container.querySelector(".text-metric")).toBeNull();
  });

  it("prints scales as SI volumes, step ratios as ×, and MAE columns with shared decimals", () => {
    const { container } = render(<ReadoutReport html={PAGE} fileName={null} onEdit={() => {}} onReset={() => {}} />);
    const details = screen.getByText("Backtest ladder, scale by scale").closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    const text = (container.textContent ?? "").replace(/\u00A0/g, " ");
    expect(text).toContain("250 mL");
    expect(text).toContain("5,000 L");
    expect(text).toContain("3.3×");
    expect(text).toContain("1.5×");
    expect(text).toContain("0.520");
  });
});

describe("staged track (C11 without a stage registry)", () => {
  it("draws every gate open with no decision, no stage done, and no linked evidence", () => {
    const { container } = render(<ScaleTrack />);
    const text = (container.textContent ?? "").replace(/\u00A0/g, " ");
    expect(text.match(/gate open: no decision recorded/g)).toHaveLength(5);
    expect(text.match(/No Kalos data linked to this stage/g)).toHaveLength(6);
    expect(text).toContain("No decision recorded");
    expect(text).not.toMatch(/\bDone\b|\bcurrent\b/);
  });

  it("prints stage volumes through formatVolume", () => {
    expect(stageVolume({ liters: [100e-6, 3e-3] })?.replace(/\u00A0/g, " ")).toBe("100 µL to 3 mL");
    expect(stageVolume({ liters: [0.5, 1] })?.replace(/\u00A0/g, " ")).toBe("500 mL to 1 L");
    expect(stageVolume({ liters: null })).toBeNull();
  });
});
