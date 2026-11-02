"use client";

import { useMemo, useRef, useState } from "react";
import { Send, Upload } from "lucide-react";
import { PlateMap, type PlateMetric } from "@/components/review/plate-map";
import { Disclosure } from "@/components/kit/disclosure";
import { PageHeader } from "@/components/kit/page-header";
import { Badge, ExampleBadge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { chatContext, exampleCourse, parseTimeCourse, review, unusualWells, type Context, type Parsed, type Verdict } from "@/lib/review";
import { cn } from "@/lib/utils";

const TONE: Record<Verdict, "good" | "warn" | "neutral" | "accent"> = { supported: "accent", possible: "warn", unlikely: "neutral", "cannot-say": "neutral" };
const WORD: Record<Verdict, string> = { supported: "Supported by the data", possible: "Possible", unlikely: "Unlikely", "cannot-say": "Can't tell from this run" };
const select = "h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-body text-fg hover:border-fg-muted focus-visible:border-accent";
const ASKS = ["Was it something I did?", "Why did growth decline?", "What should I check first?"];

type Turn = { role: "user" | "assistant"; content: string };

/**
 * Review: bring a finished (or running) experiment, see where on the plate
 * things went differently, and ask what happened. The numbers and the
 * explanations come from fixed rules over your data. A model on this device only
 * words the answer and may use nothing else, and every finding says what it
 * could not tell.
 */
export default function ReviewPage() {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [example, setExample] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [plate, setPlate] = useState<Context["plate"]>("96");
  const [vol, setVol] = useState("100");
  const [notes, setNotes] = useState("");

  const load = (text: string, name: string, isExample: boolean) => {
    const p = parseTimeCourse(text);
    if (!p) return setErr("That file did not read as a time course. Use columns time, well, value (one row per reading), or time down the side with one column per well.");
    setErr(null);
    setParsed(p);
    setFileName(name);
    setExample(isExample);
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Review"
        title="What happened in this experiment?"
        meta={example ? <ExampleBadge /> : null}
        description="Bring a plate or culture time course. See where it went differently, and ask whether it was something you did. Nothing leaves this device."
        action={
          <div className="flex gap-2">
            <label className={cn(buttonVariants({ variant: "outline" }), "cursor-pointer")}>
              <Upload /> Upload CSV
              <input type="file" accept=".csv,.tsv,.txt" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) load(await f.text(), f.name, false); e.target.value = ""; }} />
            </label>
            <Button variant="ghost" onClick={() => load(exampleCourse(), "example plate", true)}>Try an example</Button>
          </div>
        }
      />
      {err ? <p role="alert" className="text-body text-bad">{err}</p> : null}

      {!parsed ? (
        <div className="glass p-6 text-body text-fg-muted">
          <p className="max-w-[60ch]">Upload a CSV of readings over time (OD, confluence, viable cell density). One row per reading with <span className="font-mono text-code">time, well, value</span>, or time down the side and one column per well. Wells named like A1 to H12 appear on a plate map.</p>
        </div>
      ) : (
        <Results parsed={parsed} fileName={fileName} plate={plate} setPlate={setPlate} vol={vol} setVol={setVol} notes={notes} setNotes={setNotes} />
      )}
    </div>
  );
}

function Results({ parsed, fileName, plate, setPlate, vol, setVol, notes, setNotes }: { parsed: Parsed; fileName: string | null; plate: Context["plate"]; setPlate: (p: Context["plate"]) => void; vol: string; setVol: (v: string) => void; notes: string; setNotes: (n: string) => void }) {
  const days = useMemo(() => {
    const span = Math.max(...parsed.series.map((s) => s.t[s.t.length - 1])) - Math.min(...parsed.series.map((s) => s.t[0]));
    return parsed.timeUnit === "days" ? span : parsed.timeUnit === "hours" ? span / 24 : null;
  }, [parsed]);
  const ctx: Context = { plate, volumeUl: vol.trim() && Number.isFinite(Number(vol)) ? Number(vol) : null, days };
  const r = useMemo(() => review(parsed, ctx), [parsed, plate, vol, days]); // eslint-disable-line react-hooks/exhaustive-deps
  const flagged = useMemo(() => unusualWells(parsed), [parsed]);
  const [metric, setMetric] = useState<PlateMetric>("now");
  const longest = parsed.series.reduce((a, s) => (s.t.length > a.t.length ? s : a), parsed.series[0]);
  const [ti, setTi] = useState(longest.t.length - 1);
  const [selected, setSelected] = useState<string | null>(null);
  const sel = parsed.series.find((s) => s.name === selected) ?? null;

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="glass flex flex-col gap-4 p-5" aria-label="Plate">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-heading text-fg">{fileName}</h2>
            <div role="radiogroup" aria-label="Colour by" className="flex gap-1 rounded-lg bg-subtle p-1 text-label">
              {([["now", "At a time"], ["peak", "Peak"], ["fall", "Drop from peak"]] as const).map(([k, l]) => (
                <button key={k} role="radio" aria-checked={metric === k} onClick={() => setMetric(k)} className={cn("rounded-md px-3 py-1", metric === k ? "bg-surface text-fg" : "text-fg-muted hover:text-fg")}>{l}</button>
              ))}
            </div>
          </div>
          <PlateMap series={parsed.series} metric={metric} timeIndex={ti} selected={selected} flagged={flagged} onSelect={(n) => setSelected(selected === n ? null : n)} />
          {metric === "now" ? (
            <label className="flex items-center gap-3 text-caption text-fg-muted">
              <span className="w-24 shrink-0 tabular-nums">{parsed.timeUnit || "t"} {longest.t[ti]}</span>
              <input type="range" min={0} max={longest.t.length - 1} value={ti} onChange={(e) => setTi(Number(e.target.value))} aria-label="Time" className="flex-1 accent-[var(--accent)]" />
            </label>
          ) : null}
          {flagged.size ? <p className="text-caption text-fg-muted">A dot marks wells that ended far from the rest or jumped and then fell ({flagged.size}).</p> : null}
        </section>

        <aside aria-live="polite" className="glass h-fit p-5 lg:sticky lg:top-6">
          {sel ? <WellCard s={sel} all={parsed} /> : (
            <>
              <p className="text-label text-fg-muted">Was it you?</p>
              <p className="mt-1 flex items-center gap-2"><Badge tone={TONE[r.mine.verdict]}>{WORD[r.mine.verdict]}</Badge></p>
              <p className="mt-2 text-body text-fg-muted">{r.mine.text}</p>
              <p className="mt-3 text-caption text-fg-muted">Tap a well to see its curve.</p>
            </>
          )}
        </aside>
      </div>

      <section aria-label="Setup" className="glass grid gap-3 p-5 sm:grid-cols-[auto_auto_1fr]">
        <label className="flex flex-col gap-1 text-caption text-fg-muted">Vessel
          <select className={select} value={plate} onChange={(e) => setPlate(e.target.value as Context["plate"])}>
            <option value="96">96-well plate</option><option value="24">24-well plate</option><option value="6">6-well plate</option><option value="flask">Flask</option><option value="other">Other</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-caption text-fg-muted">Volume per well (µL)
          <Input inputMode="decimal" value={vol} onChange={(e) => setVol(e.target.value)} className="w-32" />
        </label>
        <label className="flex flex-col gap-1 text-caption text-fg-muted">What you did (media, volumes, dates, anything unusual)
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Added 100 µL medium per well on day 0. No medium change after." className="rounded-lg border border-border-strong bg-surface p-2.5 text-body text-fg placeholder:text-fg-muted hover:border-fg-muted focus-visible:border-accent" />
        </label>
      </section>

      <section aria-label="What the data shows" className="flex flex-col gap-4">
        <h2 className="text-heading text-fg">What the data shows</h2>
        <ul className="flex flex-col gap-1 text-body text-fg-muted">{r.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
        <div className="flex flex-col">
          {r.findings.map((f) => (
            <Disclosure key={f.id} defaultOpen={f.verdict === "supported"} summary={f.title} meta={<Badge tone={TONE[f.verdict]}>{WORD[f.verdict]}</Badge>}>
              <div className="flex flex-col gap-2 pb-4 text-body">
                {f.for.map((x, i) => <p key={i} className="text-fg">For: <span className="text-fg-muted">{x}</span></p>)}
                {f.against.map((x, i) => <p key={i} className="text-fg">Against: <span className="text-fg-muted">{x}</span></p>)}
                <p className="text-fg">How to tell: <span className="text-fg-muted">{f.test}</span></p>
              </div>
            </Disclosure>
          ))}
        </div>
        <p className="text-caption text-fg-muted">{r.caveat} No papers are attached to these findings yet, so none are cited.</p>
      </section>

      <Chat context={chatContext(r, ctx, notes)} />
    </>
  );
}

function WellCard({ s, all }: { s: Parsed["series"][number]; all: Parsed }) {
  const W = 300, H = 120, P = 6;
  const tmin = Math.min(...all.series.map((x) => x.t[0])), tmax = Math.max(...all.series.map((x) => x.t[x.t.length - 1]));
  const ys = all.series.flatMap((x) => x.y);
  const ymin = Math.min(...ys), ymax = Math.max(...ys);
  const px = (t: number) => P + ((t - tmin) / Math.max(1e-9, tmax - tmin)) * (W - 2 * P);
  const py = (y: number) => H - P - ((y - ymin) / Math.max(1e-9, ymax - ymin)) * (H - 2 * P);
  const path = (x: { t: number[]; y: number[] }) => x.t.map((t, i) => `${i ? "L" : "M"}${px(t).toFixed(1)},${py(x.y[i]).toFixed(1)}`).join("");
  return (
    <>
      <p className="text-label text-fg-muted">Well</p>
      <h2 className="text-title text-fg">{s.name}</h2>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={`Curve for ${s.name} against all other wells`}>
        {all.series.map((x) => <path key={x.name} d={path(x)} fill="none" className="stroke-border-strong" strokeWidth={1} opacity={0.5} />)}
        <path d={path(s)} fill="none" className="stroke-accent" strokeWidth={2.5} strokeLinecap="round" />
      </svg>
      <p className="mt-1 text-caption text-fg-muted">This well against every other well in grey.</p>
    </>
  );
}

function Chat({ context }: { context: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const ask = async (text: string) => {
    if (!text.trim() || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: text.trim() }];
    setTurns(next);
    setQ("");
    setBusy(true);
    try {
      const res = await fetch("/api/review/chat", { method: "POST", headers: { "content-type": "application/json", "x-kalos-csrf": "1" }, body: JSON.stringify({ messages: next, context }) });
      const j = (await res.json()) as { reply?: string; error?: string };
      setTurns([...next, { role: "assistant", content: j.reply ?? j.error ?? "No answer." }]);
    } catch {
      setTurns([...next, { role: "assistant", content: "Could not reach the local model." }]);
    } finally {
      setBusy(false);
      setTimeout(() => end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
    }
  };

  return (
    <section aria-label="Ask about this experiment" className="glass flex flex-col gap-3 p-5">
      <div>
        <h2 className="text-heading text-fg">Ask about this experiment</h2>
        <p className="text-caption text-fg-muted">Answered by a model on this device, using only the findings above and your notes.</p>
      </div>
      {turns.length === 0 ? (
        <div className="flex flex-wrap gap-2">{ASKS.map((a) => <Button key={a} variant="outline" onClick={() => void ask(a)}>{a}</Button>)}</div>
      ) : (
        <ul className="flex flex-col gap-3" aria-live="polite">
          {turns.map((t, i) => (
            <li key={i} className={cn("max-w-[68ch] rounded-2xl px-4 py-2.5 text-body", t.role === "user" ? "self-end bg-accent text-accent-fg" : "self-start bg-subtle text-fg")}>{t.content}</li>
          ))}
          {busy ? <li className="self-start text-caption text-fg-muted">Thinking…</li> : null}
          <div ref={end} />
        </ul>
      )}
      <form onSubmit={(e) => { e.preventDefault(); void ask(q); }} className="flex gap-2">
        <Input aria-label="Your question" value={q} onChange={(e) => setQ(e.target.value)} placeholder="For example: I added 100 µL on day 0 and never changed it. Does that matter?" />
        <Button type="submit" disabled={busy || !q.trim()} aria-label="Send"><Send /></Button>
      </form>
    </section>
  );
}
