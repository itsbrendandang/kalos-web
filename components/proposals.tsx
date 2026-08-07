import { Tag } from "@/components/ui/card";
import { num } from "@/lib/utils";
import { recipeColumns, recipeValue, type RecipeBearing } from "@/lib/api";

type Row = RecipeBearing & { mode: "explore" | "exploit"; reason: string };

/**
 * The proposed batch as a table, one column per process input.
 *
 * Columns come from each row's full `recipe` when the engine returned one, NOT
 * from `cols` (`proposal_features`) - that list is the abridged top-few-drivers
 * view, and rendering it alone showed an incomplete recipe next to a "run this"
 * affordance. `cols` stays the fallback for analyses with no recipe, and that
 * case is labeled rather than passed off as the whole experiment.
 */
export function Proposals<T extends Row>({
  cols,
  rows,
  predHead,
  predFn,
}: {
  cols: string[];
  rows: T[];
  predHead: string;
  predFn: (r: T) => string;
}) {
  const { names, abridged } = recipeColumns(rows, cols);
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="tabular w-full min-w-[620px] border-separate border-spacing-y-1 font-mono text-xs">
          <thead>
            <tr className="text-[10px] text-muted uppercase">
              <th className="px-2 py-1.5 text-left"></th>
              {names.map((c) => (
                <th key={c} className="px-2 py-1.5 text-right">
                  {c}
                </th>
              ))}
              <th className="px-2 py-1.5 text-right">{predHead}</th>
              <th className="px-2 py-1.5 text-left">why</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="group">
                <td className="rounded-l-xl border-y border-l border-border/70 bg-card px-2 py-2 text-left text-muted group-hover:bg-blue-soft">
                  #{i + 1}
                </td>
                {names.map((c) => {
                  const v = recipeValue(r, c, cols);
                  return (
                    <td
                      key={c}
                      className="border-y border-border/70 bg-card px-2 py-2 text-right group-hover:bg-blue-soft"
                    >
                      {typeof v === "number" ? num(v, 2) : (v ?? "—")}
                    </td>
                  );
                })}
                <td className="border-y border-border/70 bg-card px-2 py-2 text-right font-semibold text-fg group-hover:bg-blue-soft">
                  {predFn(r)}
                </td>
                <td className="rounded-r-xl border-y border-r border-border/70 bg-card px-2 py-2 text-left group-hover:bg-blue-soft">
                  <span className="inline-flex items-center gap-1.5">
                    <Tag mode={r.mode} />
                    <span className="text-muted">{r.reason}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {abridged && rows.length ? (
        <p className="mt-2 px-2 text-[11px] text-muted">
          Showing the strongest {names.length} of the model&rsquo;s inputs. This analysis predates full-recipe
          reporting, so the remaining inputs are not listed - re-run the analysis before setting these up.
        </p>
      ) : null}
    </div>
  );
}
