// Deterministic mock of the response-surface payload the engine will serve:
// a 21x21 GP posterior over two drivers. Pilot-only; no randomness so the
// page and its test are stable.
export type SurfacePayload = {
  x_feature: string;
  y_feature: string;
  x_vals: number[];
  y_vals: number[];
  /** z[iy][ix]: posterior mean (titer, g/L). */
  z: number[][];
  /** std[iy][ix]: posterior standard deviation. */
  std: number[][];
  runs: { id: string; x: number; y: number; titer: number }[];
  incumbent: { x: number; y: number; titer: number };
  proposals: { x: number; y: number }[];
};

const N = 21;
const linspace = (a: number, b: number) => Array.from({ length: N }, (_, i) => a + ((b - a) * i) / (N - 1));

export function mockSurface(): SurfacePayload {
  const x_vals = linspace(30, 38); // temperature, C
  const y_vals = linspace(6.4, 7.4); // pH
  const peak = { x: 35.2, y: 6.95 };
  const mean = (x: number, y: number) =>
    4.2 * Math.exp(-(((x - peak.x) / 2.2) ** 2 + ((y - peak.y) / 0.32) ** 2)) + 0.4;
  const runs = [
    [30.5, 6.5], [32, 7.2], [33.5, 6.8], [34.2, 7.05], [35, 6.9], [35.8, 6.95],
    [36.5, 7.3], [37.5, 6.6], [31.5, 6.9], [34.8, 6.5], [36, 6.75], [33, 7.35],
  ].map(([x, y], i) => ({ id: `R${String(i + 1).padStart(3, "0")}`, x, y, titer: +mean(x, y).toFixed(2) }));
  const z = y_vals.map((y) => x_vals.map((x) => +mean(x, y).toFixed(3)));
  const std = y_vals.map((y) =>
    x_vals.map((x) => {
      const d = Math.min(...runs.map((r) => Math.hypot((r.x - x) / 8, (r.y - y) / 1)));
      return +(0.08 + 1.6 * d).toFixed(3);
    }),
  );
  const incumbent = runs.reduce((a, b) => (b.titer > a.titer ? b : a));
  return {
    x_feature: "Temperature (°C)",
    y_feature: "pH",
    x_vals, y_vals, z, std, runs,
    incumbent: { x: incumbent.x, y: incumbent.y, titer: incumbent.titer },
    proposals: [{ x: 35.4, y: 7.0 }, { x: 34.6, y: 6.85 }],
  };
}

/** Flatten to the long format Carbon's heatmap expects. */
export function toHeatmapData(s: SurfacePayload) {
  return s.y_vals.flatMap((y, iy) =>
    s.x_vals.map((x, ix) => ({ x: x.toFixed(1), y: y.toFixed(2), value: s.z[iy][ix] })),
  );
}
