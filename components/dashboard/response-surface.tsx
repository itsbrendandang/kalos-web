import { Card } from "@/components/ui/card";
import type { PopulatedResult } from "@/lib/api";
import { seqColor, SEQ_GRADIENT_CSS } from "@/components/dashboard/heat-scale";
import { fmt } from "@/lib/utils";

/**
 * GP-predicted response surface (`d.response_surface`): the surrogate's posterior
 * mean for the target across the two strongest drivers, other inputs held at
 * their median, with the observed runs overlaid. This is a MODEL PREDICTION, not
 * measured data, and is labeled as such. Non-producer runs (target 0) overlay as
 * hollow rings, matching the run landscape. Renders nothing when the field is
 * absent (older analyses).
 */
export function ResponseSurface({ d }: { d: PopulatedResult }) {
  const rs = d.response_surface;
  if (!rs || rs.z.length === 0 || rs.z[0].length === 0) return null;
  const { x_feature, y_feature, x_vals, y_vals, z, runs } = rs;
  const gx = x_vals.length;
  const gy = y_vals.length;

  const flat = z.flat();
  const zmin = Math.min(...flat);
  const zmax = Math.max(...flat);
  const xmin = x_vals[0];
  const xmax = x_vals[gx - 1];
  const ymin = y_vals[0];
  const ymax = y_vals[gy - 1];

  const producerTargets = runs.map((r) => r[2]).filter((t) => t > 0);
  const tmin = producerTargets.length ? Math.min(...producerTargets) : 0;
  const tmax = producerTargets.length ? Math.max(...producerTargets) : 0;

  return (
    <Card className="flex h-full flex-col">
      <div className="text-[15px] font-semibold text-fg">Response surface</div>
      <p className="mt-1 text-[12px] leading-snug text-muted">
        GP-predicted {d.target} across {x_feature} and {y_feature}, other inputs at their median. A model
        prediction, not measurement - read it with the reliability above.
      </p>

      <div className="mt-3 flex flex-1 flex-col rounded-[10px] border border-border bg-bg p-3">
        <div className="flex flex-1 gap-1.5">
          <div className="flex flex-col items-center justify-between py-0.5 font-mono text-[10px] text-muted">
            <span>{fmt(ymax, 2)}</span>
            <span
              className="truncate font-sans [writing-mode:vertical-rl] rotate-180"
              title={y_feature}
              style={{ maxHeight: "120px" }}
            >
              {y_feature}
            </span>
            <span>{fmt(ymin, 2)}</span>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-[220px] flex-1 overflow-hidden rounded-[6px] border border-border">
              <div
                className="absolute inset-0 grid"
                style={{ gridTemplateColumns: `repeat(${gx}, 1fr)`, gridTemplateRows: `repeat(${gy}, 1fr)` }}
              >
                {Array.from({ length: gy }).map((_, ri) =>
                  // top visual row is the highest y, so read z from the end
                  z[gy - 1 - ri].map((v, ci) => (
                    <div key={`${ri}-${ci}`} style={{ background: seqColor(v, zmin, zmax) }} />
                  )),
                )}
              </div>
              <div className="absolute inset-0">
                {runs.map((r, i) => {
                  const [rx, ry, rt] = r;
                  const left = xmax > xmin ? ((rx - xmin) / (xmax - xmin)) * 100 : 50;
                  const top = ymax > ymin ? (1 - (ry - ymin) / (ymax - ymin)) * 100 : 50;
                  const isNon = rt === 0;
                  return (
                    <span
                      key={i}
                      className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                      style={{
                        left: `${left}%`,
                        top: `${top}%`,
                        background: isNon ? "var(--bg)" : seqColor(rt, tmin, tmax),
                        border: isNon ? "1.5px solid var(--explore-deep)" : "1px solid rgba(255,255,255,0.75)",
                      }}
                      title={`${x_feature} ${fmt(rx, 2)}, ${y_feature} ${fmt(ry, 2)} -> ${d.target} ${fmt(rt, 2)}`}
                    />
                  );
                })}
              </div>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[10px] text-muted">
              <span>{fmt(xmin, 2)}</span>
              <span className="truncate px-2 font-sans" title={x_feature}>
                {x_feature}
              </span>
              <span>{fmt(xmax, 2)}</span>
            </div>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-2 text-[10px] text-muted">
          <span>predicted {d.target}</span>
          <span className="font-mono">{fmt(zmin, 2)}</span>
          <span className="h-2 w-20 rounded-full" style={{ background: SEQ_GRADIENT_CSS }} />
          <span className="font-mono">{fmt(zmax, 2)}</span>
          <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap">
            <span className="inline-block size-2.5 rounded-full border-[1.5px] border-explore-deep bg-bg" />
            observed run
          </span>
        </div>
      </div>
    </Card>
  );
}
