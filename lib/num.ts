/*
 * The one number formatter (VIZ_SPEC section 2). Pure: no React, no DOM.
 *
 * Precision comes from the uncertainty the engine reported (the Particle Data
 * Group rounding rule), never from a fixed number of decimals: a value whose
 * band is +/- 0.65 prints one decimal, one whose band is +/- 0.031 prints
 * three. Without a known uncertainty a target value gets 3 significant
 * figures, so nothing implies more precision than anyone measured.
 *
 * Every missing or declined value has its own state (n/a, not scored,
 * refused, pending, absent) and is never printed as 0, a dash or a blank.
 * Minus signs are U+2212. A coverage percentage is printed only when the
 * engine reported one; it is never assumed.
 */

export type Basis = "measured" | "predicted" | "derived" | "setting";

export type Quantity = "target" | "setting" | "corr" | "score" | "pct" | "prob" | "count" | "ratio" | "volume" | "p";

export type IntervalSpec = {
  lo: number;
  hi: number;
  /** Engine-reported coverage as a fraction (0.9). null = the engine did not say: print no percentage. */
  coverage: number | null;
  method: "conformal" | "bootstrap-ci" | "scale-ladder";
};

export type NumState =
  | { kind: "value" }
  | { kind: "na"; reason?: string }
  | { kind: "not-scored"; reason: string }
  | { kind: "refused"; reasons: string[]; fix?: string[] }
  | { kind: "pending" }
  | { kind: "absent" };

export type FormatOptions = {
  quantity?: Quantity;
  basis?: Basis;
  unit?: string | null;
  interval?: IntervalSpec | null;
  /** Half-width or SD that sets precision when there is no interval. */
  uncertainty?: number | null;
  sigFigsFromUncertainty?: boolean;
  fallbackSigFigs?: number;
  sign?: boolean;
  /** Force a decimal count (e.g. a table column's shared `columnDecimals`). */
  decimals?: number;
};

export type Formatted = {
  state: NumState["kind"];
  text: string;
  value: string;
  unit: string | null;
  interval: string | null;
  coverage: string | null;
  decimals: number;
  aria: string;
  full: string;
};

export const MINUS = "\u2212";
const NBSP = "\u00A0";
const MAX_DECIMALS = 6;

const METHOD_WORD: Record<IntervalSpec["method"], string> = {
  conformal: "held-out band",
  "bootstrap-ci": "CI",
  "scale-ladder": "approximate band",
};

/** Rounding exponent p (the value is rounded to 10^p) for an uncertainty u > 0, per the PDG rule. */
export function precisionFromUncertainty(u: number): number {
  if (!Number.isFinite(u) || u <= 0) throw new RangeError("uncertainty must be a positive finite number");
  let e = Math.floor(Math.log10(u));
  // Three leading digits, 100-999. The small epsilon absorbs float error (0.312 / 10^-3 = 311.99999...).
  let lead = Math.floor(u / 10 ** (e - 2) + 1e-9);
  if (lead >= 1000) {
    e += 1;
    lead = Math.floor(lead / 10);
  }
  let sig: number;
  if (lead <= 354) sig = 2;
  else if (lead <= 949) sig = 1;
  else {
    e += 1;
    sig = 2;
  }
  return e - sig + 1;
}

/** Decimals for `sf` significant figures of `v` (0 when the value is large). */
function decimalsForSigFigs(v: number, sf: number): number {
  if (v === 0 || !Number.isFinite(v)) return Math.max(0, sf - 1);
  return Math.min(MAX_DECIMALS, Math.max(0, sf - 1 - Math.floor(Math.log10(Math.abs(v)))));
}

/** Rounding exponent for `sf` significant figures (positive when the value is >= 10^sf). */
function exponentForSigFigs(v: number, sf: number): number {
  if (v === 0 || !Number.isFinite(v)) return -(sf - 1);
  return Math.floor(Math.log10(Math.abs(v))) - sf + 1;
}

const grouped = (decimals: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Print `v` rounded to 10^p: fixed decimals for p <= 0, a grouped integer rounded to tens/hundreds for p > 0. */
function render(v: number, p: number, { sign = false }: { sign?: boolean } = {}): { text: string; decimals: number } {
  const pp = Math.max(p, -MAX_DECIMALS);
  const decimals = Math.max(0, -pp);
  const rounded = pp > 0 ? Math.round(v / 10 ** pp) * 10 ** pp : v;
  const body = grouped(decimals).format(Math.abs(rounded));
  const isZero = Number(body.replace(/,/g, "")) === 0;
  const prefix = isZero ? "" : rounded < 0 ? MINUS : sign ? "+" : "";
  return { text: `${prefix}${body}`, decimals };
}

/** Round `value` to the precision its uncertainty supports. */
export function roundToUncertainty(value: number, u: number): { text: string; decimals: number } {
  return render(value, precisionFromUncertainty(u));
}

const withUnit = (value: string, unit: string | null | undefined): string => {
  if (!unit) return value;
  if (unit === "%" || unit === "×") return `${value}${unit}`;
  return `${value}${NBSP}${unit}`;
};

export const coverageText = (coverage: number | null | undefined): string | null =>
  coverage != null && Number.isFinite(coverage) ? `${Math.round(coverage * 100)}%` : null;

const ABSENT: Formatted = { state: "absent", text: "", value: "", unit: null, interval: null, coverage: null, decimals: 0, aria: "", full: "" };

/** The text for a state that is not a value. Each has exactly one rendering. */
export function formatState(state: NumState): Formatted {
  const base = { ...ABSENT, state: state.kind };
  switch (state.kind) {
    case "absent":
      return ABSENT;
    case "value":
      return base;
    case "na":
      return { ...base, text: "n/a", value: "n/a", aria: state.reason ? `not available: ${state.reason}` : "not available" };
    case "not-scored":
      return { ...base, text: "Not scored", value: "Not scored", aria: `not scored: ${state.reason}` };
    case "refused":
      return { ...base, text: "Refused", value: "Refused", aria: `refused: ${state.reasons.join("; ")}` };
    case "pending":
      return { ...base, text: "Awaiting result", value: "Awaiting result", aria: "awaiting a measured result" };
  }
}

const isNum = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/** The exponent a target-like value is rounded to: from its interval (narrower side), its uncertainty, or 3 sf. */
function targetExponent(value: number, opts: FormatOptions): number {
  if (opts.decimals != null) return -Math.max(0, Math.min(MAX_DECIMALS, opts.decimals));
  if (opts.sigFigsFromUncertainty !== false) {
    const i = opts.interval;
    if (i && isNum(i.lo) && isNum(i.hi)) {
      const u = Math.min(value - i.lo, i.hi - value);
      if (u > 0) return precisionFromUncertainty(u);
      const w = (i.hi - i.lo) / 2;
      if (w > 0) return precisionFromUncertainty(w);
    }
    if (isNum(opts.uncertainty) && opts.uncertainty > 0) return precisionFromUncertainty(opts.uncertainty);
  }
  return exponentForSigFigs(value, opts.fallbackSigFigs ?? 3);
}

/** Format one engine number with its unit, interval and coverage. */
export function formatValue(value: number | null | undefined, opts: FormatOptions = {}): Formatted {
  if (!isNum(value)) return formatState({ kind: "na" });
  const quantity = opts.quantity ?? "target";
  switch (quantity) {
    case "corr":
    case "score":
      return finish(value, -2, opts);
    case "pct": {
      const r = render(value * 100, 0, { sign: opts.sign });
      return finishText(value, `${r.text}%`, 0, opts, null);
    }
    case "prob":
      return formatProb(value);
    case "count": {
      const r = render(value, 0, { sign: opts.sign });
      return finishText(value, r.text, 0, opts, opts.unit ?? null);
    }
    case "ratio": {
      const p = opts.decimals != null ? -opts.decimals : Math.min(exponentForSigFigs(value, 2), 0);
      const r = render(value, p);
      return finishText(value, `${r.text}×`, r.decimals, opts, null);
    }
    case "volume":
      return formatVolume(value);
    case "p":
      return formatP(value);
    case "setting":
      return formatSetting(value, null, opts.unit, opts.decimals);
    case "target": {
      if (opts.decimals == null && !opts.interval && !isNum(opts.uncertainty) && value !== 0 && Math.abs(value) < 1e-4) {
        return finishText(value, "<0.0001", MAX_DECIMALS, opts, opts.unit ?? null);
      }
      return finish(value, targetExponent(value, opts), opts);
    }
  }
}

function finish(value: number, p: number, opts: FormatOptions): Formatted {
  const pp = Math.abs(value) >= 1e6 ? Math.max(p, 0) : p;
  const r = render(value, pp, { sign: opts.sign });
  const i = opts.interval;
  const lo = i && isNum(i.lo) ? render(i.lo, pp).text : null;
  const hi = i && isNum(i.hi) ? render(i.hi, pp).text : null;
  const interval = lo != null && hi != null ? `[${lo}, ${hi}]` : null;
  const coverage = interval ? coverageText(i?.coverage) : null;
  const unit = opts.unit ?? null;
  const parts = [withUnit(r.text, unit), interval, coverage].filter(Boolean);
  const basis = opts.basis ?? "derived";
  const method = i ? METHOD_WORD[i.method] : "";
  const aria = [
    basis === "derived" || basis === "setting" ? "" : `${basis} `,
    r.text.replace(MINUS, "minus "),
    unit ? ` ${unit}` : "",
    interval && lo && hi ? `, ${coverage ? `${coverage} ` : ""}${method} ${lo.replace(MINUS, "minus ")} to ${hi.replace(MINUS, "minus ")}` : "",
  ].join("");
  return { state: "value", text: parts.join(" "), value: r.text, unit, interval, coverage, decimals: r.decimals, aria, full: String(value) };
}

function finishText(value: number, text: string, decimals: number, opts: FormatOptions, unit: string | null): Formatted {
  const basis = opts.basis ?? "derived";
  const shown = withUnit(text, unit);
  return {
    state: "value",
    text: shown,
    value: text,
    unit,
    interval: null,
    coverage: null,
    decimals,
    aria: `${basis === "measured" || basis === "predicted" ? `${basis} ` : ""}${shown.replace(MINUS, "minus ")}`,
    full: String(value),
  };
}

/** "[lo, hi]" at the precision the interval (or its center) supports. */
export function formatInterval(i: IntervalSpec, opts: Pick<FormatOptions, "quantity" | "unit"> = {}, center?: number): string {
  if (opts.quantity === "corr" || opts.quantity === "score") return `[${render(i.lo, -2).text}, ${render(i.hi, -2).text}]`;
  const c = center ?? (i.lo + i.hi) / 2;
  return formatValue(c, { interval: i, unit: opts.unit }).interval ?? "n/a";
}

/**
 * A change from a named baseline: "+0.42", with `relative` "+11%" only when
 * the baseline is positive and the caller allows it. Precision follows the
 * coarser of the two operands. Never colored by sign (VIZ_SPEC 2.5).
 */
export function formatDelta(
  current: number | null | undefined,
  baseline: number | null | undefined,
  opts: FormatOptions & { relative?: boolean } = {},
): Formatted & { relative: string | null } {
  if (!isNum(current) || !isNum(baseline)) return { ...formatState({ kind: "na" }), relative: null };
  const delta = current - baseline;
  let p: number;
  if (opts.decimals != null) p = -opts.decimals;
  else if (isNum(opts.uncertainty) && opts.uncertainty > 0) p = precisionFromUncertainty(opts.uncertainty);
  else {
    const sf = opts.fallbackSigFigs ?? 3;
    p = Math.max(exponentForSigFigs(current, sf), exponentForSigFigs(baseline, sf));
  }
  const f = finish(delta, p, { ...opts, sign: true, interval: null });
  const relative = opts.relative !== false && baseline > 0 ? `${render((delta / baseline) * 100, 0, { sign: true }).text}%` : null;
  return { ...f, relative };
}

/** Spearman rho and friends: 2 decimals, with its 95% CI when the engine sent one. */
export function formatCorr(rho: number | null | undefined, ci?: [number, number] | null): Formatted {
  if (!isNum(rho)) return formatState({ kind: "na" });
  const f = finish(rho, -2, { quantity: "corr" });
  if (!ci || !isNum(ci[0]) || !isNum(ci[1])) return { ...f, text: `ρ ${f.value}`, aria: `rho ${f.aria}` };
  const interval = `[${render(ci[0], -2).text}, ${render(ci[1], -2).text}]`;
  return {
    ...f,
    interval,
    coverage: "95%",
    text: `ρ ${f.value} ${interval} 95% CI`,
    aria: `rho ${f.aria}, 95% confidence interval ${interval.slice(1, -1).replace(/\u2212/g, "minus ").replace(", ", " to ")}`,
  };
}

/** Liters to the friendliest SI unit, 3 significant figures, no scientific notation. */
export function formatVolume(liters: number | null | undefined): Formatted {
  if (!isNum(liters)) return formatState({ kind: "na" });
  const abs = Math.abs(liters);
  const [v, unit] = abs < 1e-3 ? [liters * 1e6, "µL"] : abs < 1 ? [liters * 1e3, "mL"] : [liters, "L"];
  const p = abs >= 10_000 ? 0 : Math.max(exponentForSigFigs(v, 3), -MAX_DECIMALS);
  const r = render(v, p);
  // Drop trailing zeros a 3-sf rendering adds to round volumes ("250.0 mL" never reads well).
  const text = r.text.includes(".") ? r.text.replace(/\.?0+$/, "") : r.text;
  return { state: "value", text: withUnit(text, unit), value: text, unit, interval: null, coverage: null, decimals: r.decimals, aria: `${text} ${unit}`, full: String(liters) };
}

/** A p- or q-value: "<0.001" or 2 significant figures. */
export function formatP(p: number | null | undefined): Formatted {
  if (!isNum(p)) return formatState({ kind: "na" });
  if (p < 0.001) return { ...formatState({ kind: "value" }), state: "value", text: "<0.001", value: "<0.001", decimals: 3, aria: "less than 0.001", full: String(p) };
  const r = render(p, Math.min(exponentForSigFigs(p, 2), 0));
  return { ...formatState({ kind: "value" }), state: "value", text: r.text, value: r.text, decimals: r.decimals, aria: r.text, full: String(p) };
}

/** A probability as an integer percent, clamped to "<1%" / ">99%". */
export function formatProb(p: number | null | undefined): Formatted {
  if (!isNum(p)) return formatState({ kind: "na" });
  const text = p < 0.01 ? "<1%" : p > 0.99 ? ">99%" : `${Math.round(p * 100)}%`;
  return { ...formatState({ kind: "value" }), state: "value", text, value: text, decimals: 0, aria: text.replace("<", "less than ").replace(">", "more than "), full: String(p) };
}

/** Decimals a setpoint shows, from its search range: 2 - floor(log10(width)), between 0 and 3. */
export function settingDecimals(range: [number, number] | null | undefined): number | null {
  if (!range || !isNum(range[0]) || !isNum(range[1])) return null;
  const w = Math.abs(range[1] - range[0]);
  if (w <= 0) return null;
  return Math.max(0, Math.min(3, 2 - Math.floor(Math.log10(w))));
}

/** A recipe setpoint, at the precision its search range supports (3 sf, at most 3 decimals, without one). */
export function formatSetting(v: number | null | undefined, range?: [number, number] | null, unit?: string | null, decimals?: number): Formatted {
  if (!isNum(v)) return formatState({ kind: "na" });
  const d = decimals ?? settingDecimals(range) ?? Math.min(3, decimalsForSigFigs(v, 3));
  return finish(v, -d, { quantity: "setting", basis: "setting", unit });
}

/** True when a setpoint sits within 1% of either end of its search range. */
export function atRangeEdge(v: number, range: [number, number] | null | undefined): boolean {
  if (!range) return false;
  const [lo, hi] = range;
  const tol = Math.abs(hi - lo) * 0.01;
  return Math.abs(v - lo) <= tol || Math.abs(hi - v) <= tol;
}

/** The finest decimals any row needs, so a table column aligns on the decimal point. */
export function columnDecimals(rows: { value: number; u: number | null }[], fallbackSigFigs = 3): number {
  let d = 0;
  for (const r of rows) {
    if (!isNum(r.value)) continue;
    const p = isNum(r.u) && r.u > 0 ? precisionFromUncertainty(r.u) : exponentForSigFigs(r.value, fallbackSigFigs);
    d = Math.max(d, Math.min(MAX_DECIMALS, Math.max(0, -p)));
  }
  return d;
}

/** "Titer (g/L)" -> { name: "Titer", unit: "g/L" }. Only a trailing parenthesised unit counts; none is invented. */
export function parseUnit(header: string): { name: string; unit: string | null } {
  const m = header.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? { name: m[1], unit: m[2] } : { name: header, unit: null };
}

/** An engine conformal band around a prediction, or null when the engine sent none. Bounds from the unrounded value. */
export function conformalInterval(pred: number | null | undefined, halfWidth: number | null | undefined, coverage: number | null | undefined): IntervalSpec | null {
  if (!isNum(pred) || !isNum(halfWidth) || halfWidth <= 0) return null;
  return { lo: pred - halfWidth, hi: pred + halfWidth, coverage: isNum(coverage) ? coverage : null, method: "conformal" };
}
