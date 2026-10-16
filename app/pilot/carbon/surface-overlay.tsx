import type { SurfacePayload } from "@/lib/pilot/mock-surface";

const W = 640, H = 480, M = { l: 52, r: 16, t: 12, b: 44 };

/** Pure-SVG fallback for what Carbon Charts cannot draw. Contours are per-cell
 * edges where sigma crosses a level (a cheap marching-squares), enough for a pilot. */
export function SurfaceOverlay({ surface: s }: { surface: SurfacePayload }) {
  const nx = s.x_vals.length, ny = s.y_vals.length;
  const [x0, x1] = [s.x_vals[0], s.x_vals[nx - 1]];
  const [y0, y1] = [s.y_vals[0], s.y_vals[ny - 1]];
  const px = (x: number) => M.l + ((x - x0) / (x1 - x0)) * (W - M.l - M.r);
  const py = (y: number) => H - M.b - ((y - y0) / (y1 - y0)) * (H - M.t - M.b);
  const cw = (W - M.l - M.r) / (nx - 1), ch = (H - M.t - M.b) / (ny - 1);
  const zs = s.z.flat(), zmin = Math.min(...zs), zmax = Math.max(...zs);
  const seq = ["--chart-seq-1", "--chart-seq-2", "--chart-seq-3", "--chart-seq-4", "--chart-seq-5"];
  const color = (z: number) => `var(${seq[Math.min(4, Math.floor(((z - zmin) / (zmax - zmin || 1)) * 5))]})`;
  const level = (Math.min(...s.std.flat()) + Math.max(...s.std.flat())) / 2;
  const edges: [number, number, number, number][] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx - 1; i++)
      if (s.std[j][i] < level !== s.std[j][i + 1] < level) {
        const t = (level - s.std[j][i]) / (s.std[j][i + 1] - s.std[j][i]);
        const x = s.x_vals[i] + t * (s.x_vals[i + 1] - s.x_vals[i]);
        edges.push([px(x), py(s.y_vals[j]) - ch / 2, px(x), py(s.y_vals[j]) + ch / 2]);
      }
  for (let j = 0; j < ny - 1; j++)
    for (let i = 0; i < nx; i++)
      if (s.std[j][i] < level !== s.std[j + 1][i] < level) {
        const t = (level - s.std[j][i]) / (s.std[j + 1][i] - s.std[j][i]);
        const y = s.y_vals[j] + t * (s.y_vals[j + 1] - s.y_vals[j]);
        edges.push([px(s.x_vals[i]) - cw / 2, py(y), px(s.x_vals[i]) + cw / 2, py(y)]);
      }
  const star = (cx: number, cy: number, r: number) =>
    Array.from({ length: 10 }, (_, k) => {
      const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r;
      return `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`;
    }).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Response surface with uncertainty contour, incumbent and proposals" style={{ width: "100%", maxWidth: W }}>
      {s.y_vals.map((y, j) => s.x_vals.map((x, i) => (
        <rect key={`${i}-${j}`} x={px(x) - cw / 2} y={py(y) - ch / 2} width={cw + 0.5} height={ch + 0.5} fill={color(s.z[j][i])} />
      )))}
      {edges.map((e, k) => <line key={k} x1={e[0]} y1={e[1]} x2={e[2]} y2={e[3]} stroke="var(--fg)" strokeWidth={1.5} strokeDasharray="3 2" />)}
      {s.runs.map((r) => <circle key={r.id} cx={px(r.x)} cy={py(r.y)} r={3.5} fill="var(--surface)" stroke="var(--fg)" />)}
      <polygon points={star(px(s.incumbent.x), py(s.incumbent.y), 11)} fill="var(--warn)" stroke="var(--fg)" />
      {s.proposals.map((p, k) => {
        const cx = px(p.x), cy = py(p.y);
        return <polygon key={k} points={`${cx},${cy - 9} ${cx + 9},${cy} ${cx},${cy + 9} ${cx - 9},${cy}`} fill="var(--accent)" stroke="var(--accent-fg)" strokeWidth={1.5} />;
      })}
      <text x={W / 2} y={H - 8} textAnchor="middle" fontSize={12} fill="var(--fg-muted)">{s.x_feature}</text>
      <text x={14} y={H / 2} textAnchor="middle" fontSize={12} fill="var(--fg-muted)" transform={`rotate(-90 14 ${H / 2})`}>{s.y_feature}</text>
    </svg>
  );
}
