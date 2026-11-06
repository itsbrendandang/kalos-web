"use client";

import { useEffect, useState } from "react";
import { AssistantSettings } from "@/components/assist/assistant-settings";
import { Disclosure } from "@/components/kit/disclosure";
import { PageHeader } from "@/components/kit/page-header";
import { Section } from "@/components/kit/section";
import { Verdict } from "@/components/kit/verdict";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
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
      <AssistantSettings />
      <Integrations />
      <Section title="Activity log" description="A local log of changes you made to your process map. It is not an audit trail for regulated records.">
        <Link href="/settings/audit" className={buttonVariants({ variant: "outline" })}>View activity log</Link>
      </Section>
    </div>
  );
}

function Appearance() {
  const theme = useThemePreference();
  return (
    <Section title="Appearance" description="Saved on this device only.">
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
    >
      {loading || busy ? (
        <LoadingSkeleton rows={1} label="Checking the engine" />
      ) : failed ? (
        <Verdict tone="bad">The engine did not answer. Check that it is running, then check the connection again.</Verdict>
      ) : (
        <Verdict tone="good">Connected to the engine{version ? `, version ${version}` : ""}.</Verdict>
      )}
      <div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => {
            void latest.refresh();
            void campaign.refresh();
          }}
        >
          {busy ? "Checking..." : "Check the connection"}
        </Button>
      </div>
    </Section>
  );
}

/** Plain names for the engine's optional providers; the raw name stays in the row's disclosure. */
const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Column and unit matching",
  bionemo: "Protein-sequence embeddings",
};

function providerLabel(name: string): string {
  return PROVIDER_LABEL[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
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
        <ul className="divide-y divide-border border-y border-border">
          {providers.map((p) => (
            <li key={p.name} className="py-3">
              <div className="flex items-center justify-between gap-4">
                <p className="text-label text-fg">{providerLabel(p.name)}</p>
                <Badge tone={p.available ? "good" : "neutral"} className="shrink-0">
                  {p.available ? "Set up" : "Built-in fallback"}
                </Badge>
              </div>
              <Disclosure summary="What it needs" className="border-t-0">
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-body">
                  <dt className="text-fg-muted">Provider</dt>
                  <dd className="font-mono text-code text-fg">{p.name}</dd>
                  <dt className="text-fg-muted">What it adds</dt>
                  <dd className="text-fg">{p.capability}</dd>
                  <dt className="text-fg-muted">Without it</dt>
                  <dd className="text-fg">{p.fallback}</dd>
                  {!p.available ? (
                    <>
                      <dt className="text-fg-muted">To enable</dt>
                      <dd className="text-fg">
                        Set <span className="font-mono text-code">{(p.missing_env.length ? p.missing_env : p.required_env).join(", ")}</span> on the engine.
                      </dd>
                    </>
                  ) : null}
                </dl>
              </Disclosure>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
