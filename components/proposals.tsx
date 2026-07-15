import { Tag } from "@/components/ui/card";
import { num } from "@/lib/utils";

type Row = { vals: number[]; mode: "explore" | "exploit"; reason: string };

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
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full min-w-[620px] border-separate border-spacing-y-1 font-mono text-xs">
        <thead>
          <tr className="text-[10px] text-muted uppercase">
            <th className="px-2 py-1.5"></th>
            {cols.map((c) => (
              <th key={c} className="px-2 py-1.5">
                {c}
              </th>
            ))}
            <th className="px-2 py-1.5">{predHead}</th>
            <th className="px-2 py-1.5">why</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="group">
              <td className="rounded-l-xl border-y border-l border-border/70 bg-card px-2 py-2 text-muted group-hover:bg-blue-soft">
                #{i + 1}
              </td>
              {r.vals.map((v, j) => (
                <td key={j} className="border-y border-border/70 bg-card px-2 py-2 group-hover:bg-blue-soft">
                  {num(v, 2)}
                </td>
              ))}
              <td className="border-y border-border/70 bg-card px-2 py-2 font-semibold text-fg group-hover:bg-blue-soft">
                {predFn(r)}
              </td>
              <td className="rounded-r-xl border-y border-r border-border/70 bg-card px-2 py-2 group-hover:bg-blue-soft">
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
  );
}
