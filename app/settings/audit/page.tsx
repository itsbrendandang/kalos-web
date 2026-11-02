"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/kit/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { verifyChain } from "@/lib/audit";
import { sha256, useAudit } from "@/lib/audit-store";

type Check = { state: "idle" } | { state: "ok" } | { state: "bad"; seq: number; why: string };

/** Change history of the process map on this device. Each entry is chained to the one before it. */
export default function AuditPage() {
  const entries = useAudit();
  const [check, setCheck] = useState<Check>({ state: "idle" });

  const verify = async () => {
    const r = await verifyChain(entries, sha256);
    setCheck(r.ok ? { state: "ok" } : { state: "bad", seq: r.seq, why: r.why });
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "kalos-audit-log.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader
        eyebrow="Settings"
        title="Change history"
        description="Every change to your process map, newest first. Entries can be added but not edited here, and each one is linked to the one before it, so a changed or removed entry shows up when you check."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void verify()} disabled={!entries.length}>Check the history</Button>
            <Button variant="ghost" onClick={download} disabled={!entries.length}><Download /> Download JSON</Button>
          </div>
        }
      />
      <div role="status" aria-live="polite">
        {check.state === "ok" ? <p className="text-body text-fg"><Badge tone="good">Intact</Badge> {entries.length === 1 ? "The one entry matches." : `All ${entries.length} entries match.`}</p> : null}
        {check.state === "bad" ? <p className="text-body text-bad">Entry {check.seq} does not check out. {check.why}</p> : null}
      </div>
      {entries.length === 0 ? (
        <p className="text-body text-fg-muted">Nothing recorded yet. Changes to the Process page appear here.</p>
      ) : (
        <ol className="glass divide-y divide-border px-5">
          {[...entries].reverse().map((e) => (
            <li key={e.seq} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-4">
              <time dateTime={e.at} className="w-44 shrink-0 text-caption tabular-nums text-fg-muted">{new Date(e.at).toLocaleString()}</time>
              <span className="min-w-0 text-body text-fg">{e.detail}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="text-caption text-fg-muted">
        This history is kept on this device and records changes made as {entries[0]?.actor ?? "this device"}. It is tamper-evident, not tamper-proof: anyone who can open this browser&apos;s storage can rewrite all of it. It is not an electronic-signature or validated GxP record.
      </p>
    </div>
  );
}
