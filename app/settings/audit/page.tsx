"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Disclosure } from "@/components/kit/disclosure";
import { PageHeader } from "@/components/kit/page-header";
import { Verdict } from "@/components/kit/verdict";
import { Button } from "@/components/ui/button";
import { actorCaption, verifyChain } from "@/lib/audit";
import { sha256, useAudit } from "@/lib/audit-store";
import { relativeTime } from "./relative-time";

type Check = { state: "idle" } | { state: "ok" } | { state: "bad"; seq: number; why: string };

/** Local activity log of changes to the process map. Each entry is chained to the one before it. Not an audit trail for regulated records. */
export default function AuditPage() {
  const { entries, where } = useAudit();
  const [check, setCheck] = useState<Check>({ state: "idle" });
  const last = entries.at(-1);

  const verify = async () => {
    const r = await verifyChain(entries, sha256);
    setCheck(r.ok ? { state: "ok" } : { state: "bad", seq: r.seq, why: r.why });
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "kalos-activity-log.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader
        className="max-sm:flex-col max-sm:items-start"
        eyebrow="Settings"
        title="Local activity log"
        description="Changes made on this device to your process map, newest first. A local log, not an audit trail."
        action={
          <Button variant="outline" onClick={() => void verify()} disabled={!entries.length}>
            Check the history
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <p className="text-body text-fg">
          {entries.length === 0
            ? "No entries yet. Changes to the Process page appear here."
            : `${entries.length} ${entries.length === 1 ? "entry" : "entries"}; last change ${last ? relativeTime(last.at) : ""}.`}
        </p>
        <div role="status" aria-live="polite" className={check.state === "idle" ? "hidden" : undefined}>
          {check.state === "ok" ? (
            <Verdict tone="good">{entries.length === 1 ? "The one entry matches its record." : `All ${entries.length} entries match their records.`}</Verdict>
          ) : null}
          {check.state === "bad" ? (
            <Verdict tone="bad" detail={check.why}>
              Entry {check.seq} does not match its record.
            </Verdict>
          ) : null}
        </div>
      </div>

      {entries.length > 0 ? (
        <ol className="divide-y divide-border border-t border-border">
          {[...entries].reverse().map((e) => (
            <li key={e.seq} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-4">
              <time dateTime={e.at} className="w-44 shrink-0 text-caption tabular-nums text-fg-muted">
                {new Date(e.at).toLocaleString()}
              </time>
              <span className="min-w-0">
                <span className="block text-body text-fg">{e.detail}</span>
                <span className="block text-caption text-fg-muted">{actorCaption(e.actor)}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <Disclosure summary="Where this is kept">
        <div className="flex flex-col gap-2 text-body text-fg-muted">
          <p>
            {where === "file" ? "In a file in your Kalos folder (audit-log.jsonl)." : "In this browser's storage."} Each change is recorded with who made it: a
            signed-in name, or Local mode when there is no sign-in.
          </p>
          <p>
            Entries can be added here but not edited, and each one is linked to the one before it, so a changed or removed entry shows up when you check the
            history. Anyone who can open {where === "file" ? "that file" : "this browser's storage"} can still rewrite all of it.
          </p>
          <p>It is not an audit trail for regulated records and has no electronic signatures.</p>
        </div>
      </Disclosure>

      <div>
        <Button variant="ghost" onClick={download} disabled={!entries.length}>
          <Download aria-hidden /> Download JSON
        </Button>
      </div>
    </div>
  );
}
