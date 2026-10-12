// Adapted from Tremor, https://github.com/tremorlabs/tremor, Apache-2.0 (see ./NOTICE).
// Source: src/utils/chartColors.ts [v0.1.0], src/utils/getYAxisDomain.ts [v0.0.0].
// Modified: colours are the Kalos chart tokens, not Tremor's Tailwind palette.

export type ColorUtility = "bg" | "stroke" | "fill" | "text";

/**
 * Chart colours by role. `accent` is the one colour for single-series marks;
 * `chart1..6` are the categorical (Okabe-Ito) series; `muted` de-emphasises
 * (e.g. drivers that are not significant). Literal class names so Tailwind
 * sees them.
 */
export const chartColors = {
  accent: { bg: "bg-accent", stroke: "stroke-accent", fill: "fill-accent", text: "text-accent" },
  chart1: { bg: "bg-chart-1", stroke: "stroke-chart-1", fill: "fill-chart-1", text: "text-chart-1" },
  chart2: { bg: "bg-chart-2", stroke: "stroke-chart-2", fill: "fill-chart-2", text: "text-chart-2" },
  chart3: { bg: "bg-chart-3", stroke: "stroke-chart-3", fill: "fill-chart-3", text: "text-chart-3" },
  chart4: { bg: "bg-chart-4", stroke: "stroke-chart-4", fill: "fill-chart-4", text: "text-chart-4" },
  chart5: { bg: "bg-chart-5", stroke: "stroke-chart-5", fill: "fill-chart-5", text: "text-chart-5" },
  chart6: { bg: "bg-chart-6", stroke: "stroke-chart-6", fill: "fill-chart-6", text: "text-chart-6" },
  muted: { bg: "bg-fg-muted", stroke: "stroke-fg-muted", fill: "fill-fg-muted", text: "text-fg-muted" },
} as const satisfies Record<string, Record<ColorUtility, string>>;

export type ChartColor = keyof typeof chartColors;

export const AvailableChartColors: ChartColor[] = ["accent", "chart2", "chart3", "chart4", "chart5", "chart6"];

export const constructCategoryColors = (categories: string[], colors: ChartColor[]): Map<string, ChartColor> =>
  new Map(categories.map((category, i) => [category, colors[i % colors.length]]));

export const getColorClassName = (color: ChartColor, type: ColorUtility): string => chartColors[color][type];

export const getYAxisDomain = (autoMinValue: boolean, minValue: number | undefined, maxValue: number | undefined) =>
  [autoMinValue ? "auto" : (minValue ?? 0), maxValue ?? "auto"] as [number | "auto", number | "auto"];
