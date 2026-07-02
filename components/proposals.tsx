import { Tag } from "@/components/ui/card";
import { fmt } from "@/lib/utils";

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
      <table className="tabular w-full border-collapse font-mono text-xs">
        <thead>
          <tr className="text-[10px] tracking-wide text-muted uppercase">
            <th className="border-b border-border px-2 py-1.5 text-left"></th>
            {cols.map((c) => (
              <th key={c} className="border-b border-border px-2 py-1.5 text-right">{c}</th>
            ))}
            <th className="border-b border-border px-2 py-1.5 text-right">{predHead}</th>
            <th className="border-b border-border px-2 py-1.5 text-left">why</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="border-b border-border/60 px-2 py-1.5 text-left text-muted">#{i + 1}</td>
              {r.vals.map((v, j) => (
                <td key={j} className="border-b border-border/60 px-2 py-1.5 text-right">{fmt(v)}</td>
              ))}
              <td className="border-b border-border/60 px-2 py-1.5 text-right">{predFn(r)}</td>
              <td className="border-b border-border/60 px-2 py-1.5 text-left">
                <Tag mode={r.mode} /> <span className="text-muted">{r.reason}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
