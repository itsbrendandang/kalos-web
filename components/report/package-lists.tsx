import { CircleCheck, CircleMinus, CircleSlash } from "lucide-react";
import { packageContents, type DataPackage } from "@/lib/report-package";

/** What the package holds, each line checked against what the engine actually sent. */
export function PackageContents({ pkg }: { pkg: DataPackage }) {
  return (
    <ul className="flex flex-col">
      {packageContents(pkg).map((item) => (
        <li key={item.label} className="flex items-start gap-2.5 border-t border-border py-2.5">
          {item.present ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-good" aria-hidden />
          ) : (
            <CircleMinus className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
          )}
          <span className="min-w-0">
            <span className="text-label text-fg">{item.label}</span>
            <span className="sr-only">{item.present ? " (included)" : " (empty)"}</span>
            <span className="block text-caption text-fg-muted">{item.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** What the package cannot hold, and plainly why. */
export function NotInPackage({ pkg }: { pkg: DataPackage }) {
  return (
    <ul className="flex flex-col">
      {pkg.not_included.map((n) => (
        <li key={n.item} className="flex items-start gap-2.5 border-t border-border py-2.5">
          <CircleSlash className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
          <span className="min-w-0">
            <span className="text-label text-fg">{n.item}</span>
            <span className="block text-caption text-fg-muted">{n.reason}</span>
            {n.item === "Base data rows" ? (
              <span className="mt-1 block font-mono text-caption break-all text-fg" title="input_sha256 of the uploaded sheet">
                input_sha256 {pkg.data.input_sha256 ?? "n/a"}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
