"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { getProviders, type Provider } from "@/lib/api";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSkeleton } from "@/components/ui/honest-state";
import { cn } from "@/lib/utils";

type LoadState = "loading" | "error" | "ready";

/**
 * Compact list of optional AI-provider capabilities (GET /api/providers) -
 * e.g. an LLM-assisted check some validation runs can use when a key is
 * configured. Framed neutrally throughout: an unconfigured provider is a
 * documented optional upgrade, not an error or a warning, so it never
 * borrows the red/amber status tokens. Never renders a credential value -
 * only provider names and env var *names* that are missing, not their
 * contents.
 */
export function ProviderStatus() {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    getProviders()
      .then((d) => {
        if (!cancelled) {
          setProviders(d.providers);
          setState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <SectionLabel>Optional AI providers</SectionLabel>
      <p className="mb-3 text-[12px] leading-5 text-muted">
        Some checks can use an LLM provider when one is configured. None are required to validate a run sheet.
      </p>

      {state === "loading" ? <LoadingSkeleton variant="rows" rows={2} label="Checking configured providers" /> : null}
      {state === "error" ? <p className="text-[12px] text-muted">Could not reach the engine to list providers.</p> : null}

      {state === "ready" && providers ? (
        providers.length === 0 ? (
          <p className="text-[12px] text-muted">No optional providers are registered by this engine build.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {providers.map((p) => (
              <div key={p.name} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12.5px] font-semibold text-fg capitalize">{p.name}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "h-auto gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                      p.available ? "border-green-soft bg-green-soft text-green" : "border-explore-soft bg-explore-soft text-explore-deep",
                    )}
                  >
                    {p.available ? <CheckCircle2 className="size-3" /> : <Circle className="size-3" />}
                    {p.available ? "Available" : "Not configured"}
                  </Badge>
                </div>
                <p className="text-[12px] leading-5 text-muted">{p.capability}</p>
                {!p.available ? (
                  <p className="text-[12px] leading-5 text-muted">
                    {p.fallback}
                    {p.missing_env.length ? (
                      <>
                        {" "}
                        Set <span className="font-mono text-fg">{p.missing_env.join(", ")}</span> to enable.
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )
      ) : null}
    </Card>
  );
}
