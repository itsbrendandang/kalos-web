import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/card";
import { num } from "@/lib/utils";

export type QueueRow = {
  id: string;
  vessel?: string;
  recipe: { label: string; value: string }[];
  pred: { value: string; mode: "explore" | "exploit"; why: string };
};

/**
 * The "next batch to run" queue. Callers normalize either the real portal
 * proposals (getLatest()) or the mock queued PipelineRuns into `QueueRow`s,
 * so this component doesn't need to know which source it's rendering.
 * "Start run" is intentionally not wired to anything yet - it's the
 * affordance, not a working action.
 */
export function RunQueue({ rows }: { rows: QueueRow[] }) {
  if (!rows.length) {
    return <p className="py-10 text-center text-[12px] text-muted">nothing queued</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full min-w-[640px] border-separate border-spacing-y-1.5 font-mono text-xs">
        <thead>
          <tr className="text-[10px] text-muted uppercase">
            <th className="px-2 py-1.5 text-left">Vessel</th>
            <th className="px-2 py-1.5 text-left">Recipe</th>
            <th className="px-2 py-1.5 text-right">Predicted</th>
            <th className="px-2 py-1.5 text-left">Why</th>
            <th className="px-2 py-1.5 text-right"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="group">
              <td className="rounded-l-xl border-y border-l border-border/70 bg-card px-2 py-2.5 text-left text-fg group-hover:bg-blue-soft">
                {r.vessel ?? "-"}
              </td>
              <td className="border-y border-border/70 bg-card px-2 py-2.5 text-left text-muted group-hover:bg-blue-soft">
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {r.recipe.map((c) => (
                    <span key={c.label}>
                      {c.label} <span className="font-semibold text-fg">{c.value}</span>
                    </span>
                  ))}
                </div>
              </td>
              <td className="border-y border-border/70 bg-card px-2 py-2.5 text-right font-semibold text-fg group-hover:bg-blue-soft">
                {r.pred.value}
              </td>
              <td className="border-y border-border/70 bg-card px-2 py-2.5 text-left group-hover:bg-blue-soft">
                <span className="inline-flex items-center gap-1.5">
                  <Tag mode={r.pred.mode} />
                  <span className="text-muted">{r.pred.why}</span>
                </span>
              </td>
              <td className="rounded-r-xl border-y border-r border-border/70 bg-card px-2 py-2.5 text-right group-hover:bg-blue-soft">
                <Button variant="outline" size="sm">
                  Start run
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Formats a predicted value ± sigma the same way the Results proposals
 *  table does (see components/proposals.tsx), for parity across both pages. */
export function fmtPredicted(value: number, sigma: number): string {
  return sigma > 0 ? `${num(value, 2)} ± ${num(sigma, 2)}` : num(value, 2);
}
