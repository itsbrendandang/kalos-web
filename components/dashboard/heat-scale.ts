/**
 * Shared color ramps for the dashboard heat visuals (run landscape, response
 * surface, correlation), built on the --chart-1 data-viz token in
 * DESIGN.md / app/globals.css. Interpolation needs literal RGB because CSS
 * custom properties can't be mixed numerically in JS - keep these in sync if
 * the tokens ever change.
 *
 * 2026-08-08 (shadcn migration): re-anchored on the kalos brand blue, matching
 * the single-hue sequential ramp now published as --chart-1..5 in
 * app/globals.css. A single-hue ramp is a hard requirement here: it is the
 * only sequential scale that stays monotonic under every form of color vision
 * deficiency and in greyscale print. The previous indigo anchor dated from the
 * 2026-07-16 neutral-chrome migration, which has been reverted.
 *
 * These are FILL colors for chart marks, not text. Use --chart-1-ink (which
 * flips per theme) whenever a ramp-colored value needs a legible label.
 */
const BLUE_TINT: [number, number, number] = [232, 237, 254]; // light end, above --chart-1
const BLUE: [number, number, number] = [32, 74, 244]; // --chart-3, the brand blue
const BLUE_DEEP: [number, number, number] = [11, 31, 107]; // --chart-5, deep end
const GRAY: [number, number, number] = [82, 82, 91]; // --explore-deep
const WHITE: [number, number, number] = [255, 255, 255];

function mix(c1: [number, number, number], c2: [number, number, number], t: number): string {
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Left-to-right preview of the sequential ramp, for a colorbar `background`. */
export const SEQ_GRADIENT_CSS = `linear-gradient(to right, rgb(${BLUE_TINT.join(",")}), rgb(${BLUE.join(",")}), rgb(${BLUE_DEEP.join(",")}))`;

/** Sequential blue ramp for a value in [min, max]: tint (low) -> blue -> deep (high). */
export function seqColor(value: number, min: number, max: number): string {
  if (max <= min) return mix(BLUE, BLUE, 0);
  const t = (value - min) / (max - min);
  return t <= 0.5 ? mix(BLUE_TINT, BLUE, t / 0.5) : mix(BLUE, BLUE_DEEP, (t - 0.5) / 0.5);
}

/**
 * Diverging ramp for a correlation-like value in [-1, 1]: blue for positive
 * (raises the target, matching the drivers tornado), neutral gray for negative
 * (lowers it), near-white at zero.
 */
export function divColor(v: number): string {
  const t = Math.max(-1, Math.min(1, v));
  return t >= 0 ? mix(WHITE, BLUE, t) : mix(WHITE, GRAY, -t);
}

/** Readable text color over a diverging cell (white once the fill is dark enough). */
export function divText(v: number): string {
  return Math.abs(v) > 0.55 ? "#ffffff" : "var(--fg)";
}
