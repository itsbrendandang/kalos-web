"use client";

import { useState } from "react";
import { FileText, Upload, ChevronDown, AlertTriangle, Info, RefreshCw, Play, Settings, FlaskConical, Flag } from "lucide-react";
import type { Project, Candidate, PipelineStage } from "@/app/voyager/data";
import { Phase2Live } from "./phase2-live";

const DECISION_CLASS: Record<Candidate["decision"], string> = {
  promote: "pro",
  hold: "hld",
  retire: "ret",
};
const DECISION_LABEL: Record<Candidate["decision"], string> = {
  promote: "Promote",
  hold: "Hold",
  retire: "Retire",
};

function CandidateCard({ c, defaultOpen }: { c: Candidate; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const cls = DECISION_CLASS[c.decision];
  return (
    <div className={`dc ${cls}`}>
      <div className="dc-row" onClick={() => setOpen((o) => !o)}>
        <span className="dcb">{DECISION_LABEL[c.decision]}</span>
        <div className="min-w-0 flex-1">
          <div className="dcn">{c.name}</div>
          <div className="dcsub">{c.conditions}</div>
        </div>
        <div>
          <div className="dcp">{c.prob}%</div>
          <div className="dcu">success · {c.uncertainty}</div>
        </div>
        <ChevronDown className={`size-3 text-[color:rgba(17,17,17,0.3)] transition-transform ${open ? "rotate-180" : ""}`} />
      </div>
      <div className="dcbar">
        <div className="dcf" style={{ width: `${c.prob}%` }} />
      </div>
      {open ? (
        <div className="dc-expand">
          <div className="dc-rationale">{c.rationale}</div>
          {c.drivers.length > 0 || c.scaleUp.length > 0 ? (
            <div className="dc-detail-grid">
              {c.drivers.length > 0 ? (
                <div>
                  <div className="dc-detail-label">Top drivers</div>
                  {c.drivers.map((d) => (
                    <div key={d.name} className="mini-bar-row">
                      <div className="mini-bar-label">{d.name}</div>
                      <div className="mini-bar-track">
                        <div className="mini-bar-fill" style={{ width: `${d.weight}%` }} />
                      </div>
                      <div className="mini-bar-pct">{d.weight}%</div>
                    </div>
                  ))}
                </div>
              ) : null}
              {c.scaleUp.length > 0 ? (
                <div>
                  <div className="dc-detail-label">Scale-up projection</div>
                  {c.scaleUp.map((s) => (
                    <div key={s.label} className="scale-row">
                      <div className="scale-label">{s.label}</div>
                      <div className="scale-val">{s.value}%</div>
                      <div className="scale-bar-track">
                        <div className={`scale-bar-fill ${s.warn ? "hld-fill" : "pro-fill"}`} style={{ width: `${s.value}%` }} />
                      </div>
                      <div className="scale-trend" style={s.warn ? { color: "#e65100" } : undefined}>
                        {s.delta}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {c.warning ? (
            <div className="warnbox">
              <AlertTriangle className="mr-1 inline size-3 align-[-2px]" />
              {c.warning}
            </div>
          ) : null}
          {c.note ? (
            <div className="mt-1 text-[11px] text-[color:rgba(17,17,17,0.45)]">
              <Info className="mr-1 inline size-3 align-[-2px] text-[color:var(--v-blue)]" />
              {c.note}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Pipeline({ stages, badge }: { stages: PipelineStage[]; badge: { text: string; tone: "complete" | "run" | "idle" } }) {
  const badgeStyle =
    badge.tone === "complete"
      ? { background: "#e8f5e9", color: "#2e7d32" }
      : badge.tone === "run"
        ? { background: "var(--v-blue-tint)", color: "var(--v-blue-7)" }
        : { background: "#f0f0f0", color: "rgba(17,17,17,.4)" };
  return (
    <div>
      <div className="sh">9-stage pipeline{badge.tone !== "idle" ? " · run #1" : ""}</div>
      <div className="pipe-box">
        <div className="pipe-hd">
          AI pipeline
          <span className="rounded-full px-1.5 py-0.5 text-[9px] font-medium" style={badgeStyle}>
            {badge.text}
          </span>
        </div>
        <div className="stage-list">
          {stages.map((s) => (
            <div key={s.n} className={`stg ${s.state}`}>
              <div className="snum">{s.n}</div>
              <div>
                <div className="sn">{s.name}</div>
                {s.state === "running" ? (
                  <div className="spulse">
                    <span className="spd" /> Running now
                  </div>
                ) : s.chips.length ? (
                  <div className="mt-0.5">
                    {s.chips.map((ch) => (
                      <span key={ch} className="chip">
                        {ch}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Nine-stage template used before a run has been started. */
const IDLE_STAGES: PipelineStage[] = [
  { n: 1, name: "Data ingestion & parsing", state: "pending", chips: [] },
  { n: 2, name: "Preprocessing", state: "pending", chips: [] },
  { n: 3, name: "Ensemble inference", state: "pending", chips: [] },
  { n: 4, name: "Calibration", state: "pending", chips: [] },
  { n: 5, name: "Scoring & gating", state: "pending", chips: [] },
  { n: 6, name: "Stress testing", state: "pending", chips: [] },
  { n: 7, name: "Scale-up projection", state: "pending", chips: [] },
  { n: 8, name: "Driver analysis", state: "pending", chips: [] },
  { n: 9, name: "Hyperparameter opt.", state: "pending", chips: [] },
];

function SetupView({ project }: { project: Project }) {
  return (
    <div className="two">
      <div>
        <div className="sh">Pipeline configuration</div>
        <div className="cfg-card">
          <div className="cfg-hdr">
            <span className="flex items-center gap-1.5">
              <Settings className="size-3" /> Pipeline config
            </span>
            <span className="breq">Required</span>
          </div>
          <div className="cfg-body">
            <div className="dz">
              <Settings className="mx-auto mb-1.5 size-[18px] text-[color:rgba(17,17,17,0.14)]" />
              <div className="dzt">Upload pipeline config YAML</div>
              <div className="dzs">Scale-up volumes · domain transfer · gating thresholds</div>
              <button className="dzb">
                <Upload className="size-2.5" /> Browse
              </button>
            </div>
          </div>
        </div>
        <div className="run-bar opacity-50">
          <div>
            <div className="rbt">Run scale-up pipeline</div>
            <div className="rbs">Upload config to enable</div>
          </div>
          <button className="rbtn opacity-60">
            <Play className="size-[11px]" /> Run pipeline
          </button>
        </div>
        <div className="sh mt-3.5">Experiment batch tickets</div>
        <div className="dz mb-2">
          <FileText className="mx-auto mb-1.5 size-[18px] text-[color:rgba(17,17,17,0.14)]" />
          <div className="dzt">Upload experiment batch ticket</div>
          <div className="dzs">CSV · parsed and saved to DB under this project</div>
          <button className="dzb">
            <Upload className="size-2.5" /> Browse files
          </button>
        </div>
        <div className="hist-box">
          <div className="hist-hd">Experiments in DB</div>
          {project.experiments.length ? (
            project.experiments.map((e) => (
              <div key={e.id} className="hrow">
                <FlaskConical className="size-3 text-[color:var(--v-blue)]" />
                <div className="hrn">{e.name}</div>
                <div className="hrc">{e.id}</div>
              </div>
            ))
          ) : (
            <div className="hrow">
              <div className="hrn text-[color:rgba(17,17,17,0.4)]">No experiments uploaded yet</div>
            </div>
          )}
        </div>
      </div>
      <Pipeline stages={IDLE_STAGES} badge={{ text: "Not started", tone: "idle" }} />
    </div>
  );
}

function ResultsView({ project }: { project: Project }) {
  return (
    <div className="two">
      <div>
        <div className="sh">Candidate decisions · run #{project.run?.number ?? 1}</div>
        <div className="mb-2 text-[11px] text-[color:rgba(17,17,17,0.44)]">
          Click a candidate to view full analysis before taking any lab action.
        </div>
        {project.candidates.map((c, i) => (
          <CandidateCard key={c.id} c={c} defaultOpen={i === 0} />
        ))}
        <div className="sh mt-3.5">Upload more experiments</div>
        <div className="dz mb-2">
          <FileText className="mx-auto mb-1.5 size-[18px] text-[color:rgba(17,17,17,0.14)]" />
          <div className="dzt">Upload validation batch ticket</div>
          <div className="dzs">Each upload sharpens the next pipeline run</div>
          <button className="dzb">
            <Upload className="size-2.5" /> Browse files
          </button>
        </div>
        <div className="flex justify-end">
          <button className="rbtn">
            <RefreshCw className="size-[11px]" /> Re-run pipeline
          </button>
        </div>
      </div>
      <div>
        <Pipeline stages={project.pipeline} badge={{ text: "Complete", tone: "complete" }} />
        <button className="gbtn mt-3 w-full justify-center">
          <Flag className="size-[11px]" /> Mark project complete
        </button>
      </div>
    </div>
  );
}

export function Phase2View({ project }: { project: Project }) {
  if (project.live) return <Phase2Live />;
  const complete = project.run?.status === "complete" && project.candidates.length > 0;
  return complete ? <ResultsView project={project} /> : <SetupView project={project} />;
}
