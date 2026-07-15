"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Check, FileType, Table } from "lucide-react";
import type { Project, ReportData } from "@/app/voyager/data";
import { buildProjectReportCsv } from "@/lib/voyager-store";
import { IllustrativeBanner } from "./illustrative-banner";
import { useVoyagerStore } from "./store-context";

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project";
}

/** Builds the CSV, triggers a real client-side download via a Blob + object URL, no upload/server involved. */
function downloadReportCsv(project: Project) {
  const csv = buildProjectReportCsv(project);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(project.name)}-report.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const DECISION_CLASS = { promote: "pro", hold: "hld", retire: "ret" } as const;
const DECISION_LABEL = { promote: "Promote", hold: "Hold", retire: "Retire" } as const;

/** Build a small scale-up projection curve (with an uncertainty band) from the report points. */
function ScaleUpCurve({ points }: { points: ReportData["scaleUp"] }) {
  const W = 250;
  const n = points.length;
  const x = (i: number) => 18 + (i * (W - 36)) / (n - 1);
  const y = (v: number) => 58 - ((v - 70) / (88 - 70)) * 44;
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const bandTop = points.map((p, i) => `${x(i)},${y(p.value) - 6}`);
  const bandBot = points
    .map((p, i) => `${x(i)},${y(p.value) + 6}`)
    .reverse();
  const band = [...bandTop, ...bandBot].join(" ");
  return (
    <svg viewBox="0 0 250 76" xmlns="http://www.w3.org/2000/svg" className="w-full">
      <polygon points={band} fill="var(--v-blue-tint)" />
      <polyline points={line} fill="none" stroke="var(--v-blue)" strokeWidth={1.5} />
      {points.map((p, i) => (
        <circle
          key={p.label}
          cx={x(i)}
          cy={y(p.value)}
          r={i === n - 1 ? 2.5 : 3}
          fill={i === n - 1 ? "white" : "var(--v-blue)"}
          stroke={i === n - 1 ? "var(--v-blue)" : undefined}
          strokeWidth={i === n - 1 ? 1.5 : undefined}
        />
      ))}
      {points.map((p, i) => (
        <text key={`l-${p.label}`} x={x(i)} y={72} fontSize={7.5} textAnchor="middle" fill="rgba(17,17,17,.35)">
          {p.label}
        </text>
      ))}
      <text x={x(0)} y={y(points[0].value) - 9} fontSize={7.5} fontWeight={500} textAnchor="middle" fill="var(--v-blue)">
        {points[0].value}%
      </text>
      <text x={x(n - 1)} y={y(points[n - 1].value) - 9} fontSize={7.5} fontWeight={500} textAnchor="middle" fill="var(--v-blue)">
        {points[n - 1].value}%
      </text>
    </svg>
  );
}

export function ProjectReport({ projectId }: { projectId: string }) {
  const router = useRouter();
  const store = useVoyagerStore();
  const project = store.getProject(projectId);
  const r = project?.report;
  if (!project || !r) {
    return (
      <div>
        <button className="bb" onClick={() => router.push("/voyager")}>
          <ArrowLeft className="size-3" /> All projects
        </button>
        <div className="rounded-[10px] border-[0.5px] border-[color:var(--v-border)] bg-[var(--v-surface)] px-4 py-10 text-center text-[12px] text-[color:var(--v-muted)]">
          Report not found.
        </div>
      </div>
    );
  }

  return (
    <div>
      <button className="bb" onClick={() => router.push("/voyager")}>
        <ArrowLeft className="size-3" /> All projects
      </button>

      {!project.live ? <IllustrativeBanner /> : null}

      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-full bg-green-soft text-green">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
        <div>
          <div className="v-eyebrow">{project.customerName} · Project complete</div>
          <h1 className="v-title">{project.name} · Final report</h1>
        </div>
        <div className="ml-auto flex gap-1.5">
          <button className="rbtn" onClick={() => window.print()}>
            <FileType className="size-[11px]" /> Export PDF
          </button>
          <button className="gbtn" onClick={() => downloadReportCsv(project)}>
            <Table className="size-[11px]" /> Export CSV
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-[7px] lg:grid-cols-4">
        {r.stats.map((s) => (
          <div key={s.label} className="r-stat">
            <div className="r-stat-l">{s.label}</div>
            <div className={`r-stat-v ${s.accent ? "v-report-accent" : ""}`}>{s.value}</div>
            <div className="r-stat-s">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="r-sec-t">Overview</div>
          <div className="r-prose mb-3.5">{r.overview}</div>
          <div className="r-sec-t">Candidate decisions</div>
          {r.candidates.map((c) => (
            <div key={c.name} className={`r-cand ${DECISION_CLASS[c.decision]}`}>
              <span className="dcb">{DECISION_LABEL[c.decision]}</span>
              <div className="rcn">{c.name}</div>
              <div>
                <div className="rcp">{c.prob}%</div>
                <div className="rcu">{c.uncertainty}</div>
              </div>
            </div>
          ))}
        </div>
        <div>
          <div className="r-sec-t">Top drivers & ideal ranges</div>
          <div className="mb-3.5">
            {r.drivers.map((d) => (
              <div key={d.name} className="r-driver-row">
                <div className="r-driver-name">{d.name}</div>
                <div className="r-driver-bar">
                  <div className="r-driver-fill" style={{ width: `${d.weight}%` }} />
                </div>
                <div className="r-driver-pct">{d.weight}%</div>
                <div className="r-driver-range">{d.range}</div>
              </div>
            ))}
          </div>
          <div className="r-sec-t">Scale-up projection · Experiment 1</div>
          <div className="mb-3.5 rounded-[7px] border-[0.5px] border-[color:var(--v-border)] bg-[var(--v-surface)] px-2.5 py-2.5">
            <ScaleUpCurve points={r.scaleUp} />
          </div>
          <div className="r-sec-t">Phase 1 process summary</div>
          <div className="r-prose">{r.phase1Summary}</div>
        </div>
      </div>
    </div>
  );
}
