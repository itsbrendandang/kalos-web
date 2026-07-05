import { FileText, Upload, Lock, ArrowRight, Check } from "lucide-react";
import type { Project, Iteration } from "@/app/voyager/data";

function IterationCard({ it }: { it: Iteration }) {
  return (
    <div className={`ic ${it.state}`}>
      <div className="ich">
        <div className="icnum">{it.n}</div>
        <div className="icbody">
          <div className="iclabel">{it.label}</div>
          <div className="icname">{it.name}</div>
          <div className="icsub">{it.sub}</div>
        </div>
        <div className="icright">
          <div>
            <div className="icct">{it.count}</div>
            <div className="icctl">{it.countLabel}</div>
          </div>
          {it.state === "done" ? (
            <div className="scdone">
              <span className="grid size-3.5 place-items-center rounded-full bg-green">
                <Check className="size-2 text-white" strokeWidth={3} />
              </span>
              Complete
            </div>
          ) : it.state === "active" ? (
            <div className="scact">
              <span className="pld" />
              In progress
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[11px] text-[color:var(--v-muted)]">
              <Lock className="size-[11px]" />
              Locked
            </div>
          )}
        </div>
      </div>

      {it.state === "done" && it.file ? (
        <div className="icba">
          <div className="pb">
            <div className="pbh">
              <div className="pbf">
                <FileText className="size-3 text-[color:var(--v-blue)]" /> {it.file.name}
                <span className="pbbadge">{it.file.badge}</span>
              </div>
              <span className="pbbadge v-badge-done">Ingested</span>
            </div>
            <table className="pbtbl">
              <thead>
                <tr>
                  {it.file.cols.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {it.file.rows.map((r) => (
                  <tr key={r.run}>
                    <td>{r.run}</td>
                    {r.cols.map((v, i) => (
                      <td key={i}>{v}</td>
                    ))}
                    <td className="rc">{r.result}</td>
                    <td>
                      <span className="ac">Accepted</span>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={it.file.cols.length} className="text-center text-[10px] text-[color:var(--v-faint)]">
                    {it.file.moreNote}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {it.state === "active" ? (
        <div className="icba">
          <div className="dz">
            <FileText className="mx-auto mb-1.5 size-[18px] text-[color:rgba(17,17,17,0.14)]" />
            <div className="dzt">Upload iteration {it.n} batch ticket when runs complete</div>
            <div className="dzs">Results feed the next iteration immediately</div>
            <button className="dzb">
              <Upload className="size-2.5" /> Browse files
            </button>
          </div>
          <div className="advbar">
            <div className="advtxt">
              <Lock className="mr-1 inline size-[11px] align-[-2px]" />
              Iteration {it.n + 1} unlocks once results are ingested
            </div>
            <button className="advbtn">
              Advance to iter {it.n + 1} <ArrowRight className="size-[11px]" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Phase1View({ project }: { project: Project }) {
  if (project.iterations.length === 0) {
    return (
      <div className="rounded-[10px] border-[0.5px] border-[color:var(--v-border)] bg-[var(--v-surface)] px-4 py-10 text-center text-[12px] text-[color:var(--v-muted)]">
        {project.live
          ? "This project is scored live by the engine. See the Phase 2 tab for the engine's recommended next experiments."
          : "No Phase 1 iterations for this project. It began directly in Phase 2 scale-up."}
      </div>
    );
  }
  return (
    <div>
      <div className="sh">Iterations — upload batch ticket after each run</div>
      {project.iterations.map((it) => (
        <IterationCard key={it.n} it={it} />
      ))}
    </div>
  );
}
