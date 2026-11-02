/*
 * Experiment review: read a time course and say what the numbers support, what
 * they do not, and how to tell the explanations apart. Pure rules, tested in
 * __tests__/review.test.ts. No model, no guessing: every finding cites the
 * measurement it came from, and a cause is only "supported" when the data
 * separates it from the others. One run rarely proves a cause, and the output
 * says so.
 */

export type Series = { name: string; t: number[]; y: number[] };
export type Parsed = { series: Series[]; timeUnit: string };

const num = (s: string) => {
  const v = Number(s.trim());
  return s.trim() !== "" && Number.isFinite(v) ? v : null;
};
function rowsOf(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const d = (lines[0]?.match(/\t/g)?.length ?? 0) > (lines[0]?.match(/,/g)?.length ?? 0) ? "\t" : ",";
  return lines.map((l) => l.split(d).map((c) => c.trim().replace(/^"|"$/g, "")));
}

/** Long (time, well, value) or wide (time down the side, one column per well). Null when neither reads. */
export function parseTimeCourse(text: string): Parsed | null {
  const rows = rowsOf(text);
  if (rows.length < 3) return null;
  const head = rows[0].map((h) => h.toLowerCase());
  const ti = head.findIndex((h) => /^(time|t|hours?|day|days|h)(?![a-z])/.test(h));
  const wi = head.findIndex((h) => /^(well|sample|condition|id|name)(?![a-z])/.test(h));
  const vi = head.findIndex((h, i) => i !== ti && i !== wi && /^(value|od|od600|signal|growth|confluence|viability|vcd|y)(?![a-z])/.test(h));
  const by = new Map<string, Series>();
  let unit = "";
  if (ti >= 0 && wi >= 0 && vi >= 0) {
    unit = /day/.test(head[ti]) ? "days" : /h/.test(head[ti]) ? "hours" : "";
    for (const r of rows.slice(1)) {
      const t = num(r[ti] ?? "");
      const y = num(r[vi] ?? "");
      if (t == null || y == null || !r[wi]) continue;
      const s = by.get(r[wi]) ?? { name: r[wi], t: [], y: [] };
      s.t.push(t);
      s.y.push(y);
      by.set(r[wi], s);
    }
  } else if (rows[0].length >= 2 && rows.slice(1).every((r) => num(r[0] ?? "") != null)) {
    unit = /day/.test(head[0]) ? "days" : /h/.test(head[0]) ? "hours" : "";
    rows[0].slice(1).forEach((name, c) => {
      const s: Series = { name: name || `col${c + 1}`, t: [], y: [] };
      for (const r of rows.slice(1)) {
        const y = num(r[c + 1] ?? "");
        if (y != null) { s.t.push(Number(r[0])); s.y.push(y); }
      }
      if (s.t.length) by.set(s.name, s);
    });
  } else return null;
  const series = [...by.values()].map((s) => {
    const o = s.t.map((_, i) => i).sort((a, b) => s.t[a] - s.t[b]);
    return { name: s.name, t: o.map((i) => s.t[i]), y: o.map((i) => s.y[i]) };
  }).filter((s) => s.t.length >= 3);
  return series.length ? { series, timeUnit: unit } : null;
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1)); };

export type SeriesStats = { name: string; peak: number; peakT: number; peakFrac: number; final: number; fallFrac: number; maxJump: number; jumpT: number };

export function statsOf(s: Series): SeriesStats {
  let pi = 0;
  s.y.forEach((v, i) => { if (v > s.y[pi]) pi = i; });
  const peak = s.y[pi];
  const span = Math.max(1e-9, s.t[s.t.length - 1] - s.t[0]);
  const final = s.y[s.y.length - 1];
  let jump = 0, jumpT = s.t[0];
  const scale = Math.max(1e-9, Math.abs(peak - Math.min(...s.y)));
  for (let i = 1; i < s.y.length; i++) {
    const j = (s.y[i] - s.y[i - 1]) / scale;
    if (j > jump) { jump = j; jumpT = s.t[i]; }
  }
  return { name: s.name, peak, peakT: s.t[pi], peakFrac: (s.t[pi] - s.t[0]) / span, final, fallFrac: peak > 0 ? Math.max(0, (peak - final) / peak) : 0, maxJump: jump, jumpT };
}

export type Context = { plate: "96" | "24" | "6" | "flask" | "other"; volumeUl: number | null; days: number | null };
export type Verdict = "supported" | "possible" | "unlikely" | "cannot-say";
export type Finding = { id: string; title: string; verdict: Verdict; for: string[]; against: string[]; test: string };
export type Source = { title: string; cite: string; url?: string };

export type Review = {
  facts: string[];
  findings: Finding[];
  mine: { verdict: Verdict; text: string };
  caveat: string;
};

const WELL = /^([A-P])(\d{1,2})$/i;
const f2 = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2));
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function review(p: Parsed, ctx: Context): Review {
  const st = p.series.map(statsOf);
  const n = st.length;
  const unit = p.timeUnit || "time units";
  const facts: string[] = [];
  const medPeakT = median(st.map((s) => s.peakT));
  const risefall = st.filter((s) => s.peakFrac > 0.1 && s.peakFrac < 0.9 && s.fallFrac > 0.25);
  const rfShare = risefall.length / n;
  const peakSpread = sd(st.map((s) => s.peakFrac));
  const finals = st.map((s) => s.final);
  const medFinal = median(finals);
  const mad = median(finals.map((v) => Math.abs(v - medFinal)));
  const outliers = mad > 0 ? st.filter((s) => Math.abs(s.final - medFinal) / (1.4826 * mad) > 3) : [];
  const cvFinal = mean(finals) !== 0 ? sd(finals) / Math.abs(mean(finals)) : 0;
  const peaks = st.map((s) => s.peak);
  const cvPeak = mean(peaks) !== 0 ? sd(peaks) / Math.abs(mean(peaks)) : 0;

  facts.push(`${n} series, ${p.series[0].t.length} time points each, over ${f2(Math.max(...p.series.map((s) => s.t[s.t.length - 1])) - Math.min(...p.series.map((s) => s.t[0])))} ${unit}.`);
  facts.push(`Peak (middle series) at about ${f2(medPeakT)} ${unit}; ${pct(rfShare)} of series rose and then fell by more than 25% from their peak.`);
  facts.push(`Spread between series at the end: ${pct(cvFinal)} (coefficient of variation); at the peak: ${pct(cvPeak)}.`);

  // Edge effect, only when names are plate wells.
  const wells = st.map((s) => ({ s, m: s.name.match(WELL) })).filter((x) => x.m);
  let edge: { on: boolean; edgeMean: number; innerMean: number } | null = null;
  if (wells.length >= 12 && wells.length === n) {
    const rows = wells.map((w) => w.m![1].toUpperCase().charCodeAt(0));
    const cols = wells.map((w) => Number(w.m![2]));
    const [r0, r1, c0, c1] = [Math.min(...rows), Math.max(...rows), Math.min(...cols), Math.max(...cols)];
    const isEdge = (i: number) => rows[i] === r0 || rows[i] === r1 || cols[i] === c0 || cols[i] === c1;
    const e = wells.filter((_, i) => isEdge(i)).map((w) => w.s.final);
    const inn = wells.filter((_, i) => !isEdge(i)).map((w) => w.s.final);
    if (e.length >= 4 && inn.length >= 4) {
      const em = mean(e), im = mean(inn);
      edge = { on: im !== 0 && Math.abs(em - im) / Math.abs(im) > 0.2, edgeMean: em, innerMean: im };
      facts.push(`Outer wells ended at ${f2(em)} on average vs ${f2(im)} for inner wells (${pct(Math.abs(em - im) / Math.max(1e-9, Math.abs(im)))} apart).`);
    }
  }

  const jumpers = st.filter((s) => s.maxJump > 0.6 && s.peakFrac > 0.1 && s.fallFrac > 0.25);
  const findings: Finding[] = [];

  // 1. Something shared by the whole plate.
  const shared = rfShare >= 0.6 && peakSpread < 0.2;
  findings.push({
    id: "shared",
    title: "Something changed for every well at once",
    verdict: shared ? "supported" : rfShare >= 0.4 ? "possible" : "unlikely",
    for: shared ? [`${pct(rfShare)} of series peak together (spread of peak timing is ${pct(peakSpread)} of the run) and then fall.`] : rfShare >= 0.4 ? [`${pct(rfShare)} of series rise then fall.`] : [],
    against: !shared ? [rfShare < 0.4 ? "Most series do not rise then fall." : "Peaks are spread across the run, not together."] : [],
    test: "Check what happened at the peak time: a medium change, a feed, an incubator or CO2 log entry, a plate-reader or temperature excursion. Wells that all turn together point to the environment or the medium, not to one pipetting step.",
  });

  // 2. Handling / pipetting.
  const scatter = cvPeak > 0.25 || cvFinal > 0.35 || outliers.length >= Math.max(2, Math.round(n * 0.05));
  findings.push({
    id: "handling",
    title: "Variation in how individual wells were set up",
    verdict: scatter ? (cvPeak > 0.4 ? "supported" : "possible") : cvPeak < 0.12 && cvFinal < 0.2 ? "unlikely" : "cannot-say",
    for: scatter ? [`Wells differ by ${pct(cvPeak)} at the peak${outliers.length ? ` and ${outliers.length} ended far from the rest (${outliers.slice(0, 4).map((o) => o.name).join(", ")})` : ""}.`] : [],
    against: !scatter && cvPeak < 0.12 ? [`Wells agree closely (${pct(cvPeak)} spread at the peak). Careless pipetting usually makes replicates disagree.`] : [],
    test: "Re-read your volumes against the plate map and look at whether the odd wells share a row, a tip box or a time of day. If wells that were filled the same way behave the same way, handling is a poor explanation.",
  });

  // 3. Evaporation / edge effects.
  const longRun = (ctx.days ?? 0) >= 7;
  const smallVol = ctx.plate === "96" && (ctx.volumeUl ?? 200) <= 150;
  const evapRisk = longRun && smallVol;
  findings.push({
    id: "evaporation",
    title: "Evaporation or edge effects",
    verdict: edge?.on ? "supported" : evapRisk ? "possible" : edge && !edge.on ? "unlikely" : "cannot-say",
    for: [...(edge?.on ? [`Outer wells ended ${f2(edge.edgeMean)} vs ${f2(edge.innerMean)} in the middle.`] : []), ...(evapRisk ? [`A ${ctx.volumeUl ?? "small"} µL culture in a 96-well plate for ${ctx.days} days has little volume to lose before conditions shift.`] : [])],
    against: edge && !edge.on ? ["Outer and inner wells ended similarly."] : [],
    test: "Weigh a spare plate with medium alone at the start and end, or look at the edge wells against the inner ones. Filling the outer wells with buffer or sealing the plate shows whether it matters.",
  });

  // 4. A sudden spike that is not growth.
  findings.push({
    id: "spike",
    title: "A sudden jump that may not be growth (contamination or a reading artifact)",
    verdict: jumpers.length >= 1 && jumpers.length / n < 0.5 ? "possible" : jumpers.length / n >= 0.5 ? "cannot-say" : "unlikely",
    for: jumpers.length ? [`${jumpers.length} series jump by more than 60% of their range in one step then decline (${jumpers.slice(0, 4).map((j) => `${j.name} near ${f2(j.jumpT)} ${unit}`).join(", ")}).`] : [],
    against: !jumpers.length ? ["No series shows an abrupt one-step jump."] : [],
    test: "Look at the wells under a microscope at the spike, and check for turbidity, pH colour change or a smell. A single-point jump that returns on the next read is more likely the reader than the culture.",
  });

  const handling = findings[1];
  const sharedF = findings[0];
  const mine: Review["mine"] =
    handling.verdict === "supported" || handling.verdict === "possible"
      ? { verdict: "possible", text: `Possibly. Replicates disagree more than they should, which is what uneven handling looks like. Check ${outliers.length ? outliers.slice(0, 3).map((o) => o.name).join(", ") : "the odd wells"} against your plate map first. This does not rule out a shared cause as well.` }
      : sharedF.verdict === "supported"
        ? { verdict: "unlikely", text: `Probably not the pipetting. Your wells agree with each other and turned together around ${f2(medPeakT)} ${unit}, which points to something that affected the whole plate: the medium running down, the environment, or a change you made at that point. Check what you did around then, because a step that touched every well is still possible.` }
        : { verdict: "cannot-say", text: "The data does not separate your handling from other causes. It would take replicate wells of the same condition and a record of what was done when." };

  return {
    facts,
    findings,
    mine,
    caveat: "These readings come from one run and suggest where to look. They are not proof of cause. A cause is only confirmed by changing it on purpose and repeating.",
  };
}

/** A labelled example so the page can be tried without a file. Deterministic. */
export function exampleCourse(): string {
  const rows = ["time_days,well,od"];
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  for (const r of "ABCDEFGH") for (let c = 1; c <= 12; c++) {
    const edge = r === "A" || r === "H" || c === 1 || c === 12;
    const k = (edge ? 0.7 : 1) * (0.93 + rnd() * 0.14);
    for (let d = 0; d <= 35; d += 5) {
      const rise = 1.6 * k / (1 + Math.exp(-(d - 9) / 3));
      const fall = d > 17 ? Math.min(1, (d - 17) / 16) * 0.7 * rise : 0;
      rows.push(`${d},${r}${c},${(0.05 + rise - fall + (rnd() - 0.5) * 0.03).toFixed(3)}`);
    }
  }
  return rows.join("\n");
}

/** The only things the local model is allowed to talk about: the computed facts and findings, and the scientist's own notes. */
export function chatContext(r: Review, ctx: Context, notes: string): string {
  return [
    "FACTS",
    ...r.facts.map((f) => `- ${f}`),
    "",
    "FINDINGS (computed from the data by fixed rules)",
    ...r.findings.map((f) => `- ${f.title}: ${f.verdict}. For: ${f.for.join(" ") || "none"} Against: ${f.against.join(" ") || "none"} Check: ${f.test}`),
    `- Was it the scientist's own handling? ${r.mine.verdict}. ${r.mine.text}`,
    "",
    `SETUP: plate ${ctx.plate}, volume ${ctx.volumeUl ?? "unknown"} uL, duration ${ctx.days ?? "unknown"} days`,
    `NOTES from the scientist: ${notes.trim() || "none"}`,
  ].join("\n");
}

/** Wells worth a second look: far from the middle at the end, or that jump then fall. */
export function unusualWells(p: Parsed): Set<string> {
  const st = p.series.map(statsOf);
  const finals = st.map((s) => s.final);
  const m = median(finals);
  const mad = median(finals.map((v) => Math.abs(v - m)));
  const out = new Set<string>();
  for (const s of st) {
    if (mad > 0 && Math.abs(s.final - m) / (1.4826 * mad) > 3) out.add(s.name);
    if (s.maxJump > 0.6 && s.peakFrac > 0.1 && s.fallFrac > 0.25) out.add(s.name);
  }
  return out;
}
