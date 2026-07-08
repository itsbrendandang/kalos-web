import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ServiceUnavailable({
  onRetry,
  busy,
  title = "Analysis service unavailable",
  body = "The dashboard could not reach the analysis service. Try again in a moment or contact Kalos support.",
}: {
  onRetry: () => void;
  busy: boolean;
  title?: string;
  body?: string;
}) {
  return (
    <Card className="flex flex-col gap-4 border-amber/30 bg-amber-soft sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-amber">
          <AlertCircle className="size-5" />
        </span>
        <div>
          <div className="font-head text-[16px] font-semibold text-fg">{title}</div>
          <p className="mt-1 max-w-[62ch] text-[13px] leading-5 text-explore-deep">{body}</p>
        </div>
      </div>
      <Button variant="outline" onClick={onRetry} disabled={busy}>
        <RefreshCw />
        {busy ? "Checking..." : "Try again"}
      </Button>
    </Card>
  );
}
