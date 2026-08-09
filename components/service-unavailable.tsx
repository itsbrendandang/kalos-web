import { AlertTriangle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * This is a TRANSPORT failure banner, not a data-absence one - see
 * components/ui/honest-state.tsx's ErrorState for the general-purpose
 * version of this same distinction. Kept as its own component (rather than
 * folded into ErrorState) because every one of its 5 call sites imports it
 * by this name with this exact prop shape; only its internals move onto the
 * `alert` primitive here.
 */
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
    // variant stays "default": the "destructive" variant forces
    // AlertDescription's text to the stock, contrast-unverified
    // `--destructive` red via a `*:data-[slot=alert-description]:...` child
    // selector that outranks any color class passed through className. This
    // banner is an amber "transport unavailable" warning, not a red error,
    // and its colors come from the app's own AA-checked `--amber`/`--explore`
    // tokens instead.
    <Alert
      variant="default"
      className="flex flex-col items-start gap-4 border-amber/30 bg-amber-soft px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-amber">
          <AlertTriangle className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <AlertTitle className="font-head text-[16px] font-normal text-fg">{title}</AlertTitle>
            <Badge variant="outline" className="border-amber/40 text-amber">
              transport error
            </Badge>
          </div>
          <AlertDescription className="mt-1 max-w-[62ch] text-[13px] leading-5 text-explore-deep">
            {body}
          </AlertDescription>
        </div>
      </div>
      <Button variant="outline" onClick={onRetry} disabled={busy} className="shrink-0">
        <RefreshCw />
        {busy ? "Checking..." : "Try again"}
      </Button>
    </Alert>
  );
}
