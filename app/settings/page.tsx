"use client";

import { useEffect, useState } from "react";
import { CircleCheck, Circle, LoaderCircle, Unplug } from "lucide-react";
import { Disclosure } from "@/components/kit/disclosure";
import { PageHeader } from "@/components/kit/page-header";
import { Section } from "@/components/kit/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/honest-state";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import { setThemePreference, useThemePreference, type ThemePreference } from "@/hooks/use-theme";
import { getProviders, type Provider } from "@/lib/api";
import { cn } from "@/lib/utils";

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Match the system" },
];

export default function SettingsPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <PageHeader title="Settings" description="How Kalos looks on this device, and what it is connected to." />
      <Appearance />
      <EngineConnection />
      <Integrations />
    </div>
  );
}

function Appearance() {
  const theme = useThemePreference();
  return (
    <Section title="Appearance" description="Saved in this browser only.">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Theme</legend>
        {THEMES.map((t) => (
          <label
            key={t.value}
            className={cn(
              "flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-label",
              theme === t.value ? "border-accent bg-accent-soft text-fg" : "border-border-strong bg-surface text-fg hover:bg-subtle",
            )}
          >
            <input
              type="radio"
              name="theme"
              value={t.value}
              checked={theme === t.value}
              onChange={() => setThemePreference(t.value)}
              className="accent-[var(--accent)]"
            />
            {t.label}
          </label>
        ))}
      </fieldset>
    </Section>
  );
}

function EngineConnection() {
  const latest = useLatest();
  const campaign = useCampaign();
  const busy = latest.refreshing || campaign.refreshing;
  const failed = latest.error || campaign.error;
  const loading = !failed && (latest.status === "loading" || campaign.status === "loading");
  const version = latest.data?.has_data ? latest.data.engine_version : undefined;
  return (
    <Section
      title="Engine connection"
      description="Kalos reaches the analysis engine through this app's server, so no engine credentials ever reach your browser."
      actions={
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => {
            void latest.refresh();
            void campaign.refresh();
          }}
        >
          {busy ? "Checking..." : "Check again"}
        </Button>
      }
    >
      <p className="flex items-center gap-2 text-body text-fg">
        {loading || busy ? (
          <LoaderCircle className="size-4 animate-spin text-fg-muted" aria-hidden />
        ) : failed ? (
          <Unplug className="size-4 text-bad" aria-hidden />
        ) : (
          <CircleCheck className="size-4 text-good" aria-hidden />
        )}
        {loading || busy ? "Checking the engine" : failed ? "The engine is not reachable right now." : "Connected to the engine."}
        {!failed && !loading && version ? <span className="text-fg-muted">Version {version}</span> : null}
      </p>
    </Section>
  );
}

function Integrations() {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getProviders().then(
      (d) => !cancelled && setProviders(d.providers),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Section
      title="Optional integrations"
      description="Some data checks can use an AI assistant when one is set up. None are needed: every check has a built-in fallback."
    >
      {failed ? (
        <p className="text-body text-fg-muted">Could not ask the engine which integrations are set up.</p>
      ) : !providers ? (
        <LoadingSkeleton rows={2} label="Checking integrations" />
      ) : providers.length === 0 ? (
        <p className="text-body text-fg-muted">This engine offers no optional integrations.</p>
      ) : (
        <>
          <ul className="divide-y divide-border border-y border-border">
            {providers.map((p) => (
              <li key={p.name} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div className="min-w-0">
                  <p className="text-label text-fg">{p.capability}</p>
                  {!p.available ? <p className="text-body text-fg-muted">Without it: {p.fallback}</p> : null}
                </div>
                <Badge tone={p.available ? "good" : "neutral"} variant={p.available ? "soft" : "outline"} className="shrink-0">
                  {p.available ? <CircleCheck aria-hidden /> : <Circle aria-hidden />}
                  {p.available ? "Set up" : "Not set up"}
                </Badge>
              </li>
            ))}
          </ul>
          <Disclosure summary="Details for administrators">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-body">
              {providers.map((p) => (
                <div key={p.name} className="contents">
                  <dt className="text-fg-muted">Provider {p.name}</dt>
                  <dd className="text-fg">
                    {p.available ? "configured" : `set ${p.missing_env.join(", ") || p.required_env.join(", ")} on the engine to enable`}
                  </dd>
                </div>
              ))}
            </dl>
          </Disclosure>
        </>
      )}
    </Section>
  );
}
