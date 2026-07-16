"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Flag, Play, RotateCcw } from "lucide-react";
import { Card, Kpi, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, Loading } from "@/components/page-header";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { ExperimentStatusChip } from "@/components/experiments/status-chip";
import { DriversBar, PredScatter } from "@/components/charts";
import { Proposals } from "@/components/proposals";
import { isReliable } from "@/lib/api";
import {
  ExperimentApiError,
  getExperiment,
  missingResultSections,
  patchStatus,
  runExperiment,
  type Experiment,
} from "@/lib/experiments";
import { fmt } from "@/lib/utils";

/** Detail view for one experiment: DONE renders an honest reliability +
 *  proposals summary (reusing the same chart/table components as the Run
 *  Analysis page), FAILED surfaces the portal's error, and PROCESSING /
 *  READY / DRAFT show the appropriate waiting state. */
export function ExperimentDetail({ id }: { id: string }) {
  const [exp, setExp] = useState<Experiment | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionErr, setActionErr] = useState("");

  async function refresh() {
    setBusy(true);
    setErr(false);
    try {
      setExp(await getExperiment(id));
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    getExperiment(id)
      .then((d) => {
        if (!cancelled) setExp(d);
      })
      .catch(() => {
        if (!cancelled) setErr(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function runAction(action: () => Promise<Experiment>) {
    setActionBusy(true);
    setActionErr("");
    action()
      .then((updated) => setExp(updated))
      .catch((e) => {
        setActionErr(e instanceof ExperimentApiError ? e.message : "Experiments service unavailable. Try again in a moment.");
      })
      .finally(() => setActionBusy(false));
  }

  if (err && exp == null) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <ServiceUnavailable
          onRetry={refresh}
          busy={busy}
          title="Experiments service unavailable"
          body="The dashboard could not reach the kalos portal's experiments API. Try again in a moment."
        />
      </div>
    );
  }
  if (exp == null) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <Loading />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <PageHeader
        eyebrow="Experiment"
        title={exp.name}
        desc={`Target ${exp.config.target}${exp.config.outcomes?.length ? ` / outcomes ${exp.config.outcomes.join(", ")}` : ""}${exp.config.anonymize ? " / anonymized" : ""}`}
        action={
          <div className="flex items-center gap-2">
            <ExperimentStatusChip status={exp.status} />
            {(exp.status === "DRAFT" || exp.status === "FAILED") && (
              <Button variant="outline" size="sm" disabled={actionBusy} onClick={() => runAction(() => patchStatus(exp.id, "READY"))}>
                <Flag />
                {exp.status === "FAILED" ? "Retry" : "Flag ready"}
              </Button>
            )}
            {exp.status === "READY" && (
              <Button variant="outline" size="sm" disabled={actionBusy} onClick={() => runAction(() => runExperiment(exp.id, false))}>
                <Play />
                Run
              </Button>
            )}
            {exp.status === "DONE" && (
              <Button variant="ghost" size="sm" disabled={actionBusy} onClick={() => runAction(() => runExperiment(exp.id, true))}>
                <RotateCcw />
                Re-run
              </Button>
            )}
          </div>
        }
      />

      {actionErr ? <Card className="border-amber/30 bg-amber-soft text-sm text-amber">{actionErr}</Card> : null}
      {err && exp ? (
        <Card className="border-amber/30 bg-amber-soft text-sm text-amber">Refresh failed. Showing the last loaded experiment.</Card>
      ) : null}

      <Body exp={exp} />
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/?view=table" className="inline-flex w-fit items-center gap-1.5 text-[12.5px] font-semibold text-accent-text hover:underline">
      <ArrowLeft className="size-3.5" />
      Back to experiments
    </Link>
  );
}

function Body({ exp }: { exp: Experiment }) {
  if (exp.status === "FAILED") {
    return (
      <Card className="border-red/30 bg-card">
        <SectionLabel>Run failed</SectionLabel>
        <p className="text-[13px] leading-5 text-red">{exp.error ?? "The engine reported a failure without a message."}</p>
      </Card>
    );
  }

  if (exp.status === "PROCESSING") {
    return (
      <Card>
        <Loading />
      </Card>
    );
  }

  if (exp.status === "READY" || exp.status === "DRAFT") {
    return (
      <Card className="py-10 text-center text-[13px] text-muted">
        {exp.status === "DRAFT"
          ? "This experiment is a draft. Flag it ready to queue it for the runner."
          : "This experiment is ready. Run it now, or wait for the next \"run all ready\" pass."}
      </Card>
    );
  }

  const result = exp.result;
  if (!result) {
    return <Card className="py-10 text-center text-[13px] text-muted">Marked done, but no result was returned.</Card>;
  }

  const reliability = result.cv_spearman == null ? "n/a" : isReliable(result) ? "Reliable" : "Needs review";
  const missing = missingResultSections(result);

  return (
    <Card>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Kpi hero label={`Best ${result.target}`} value={fmt(result.best, 3)} />
        <Kpi
          label="Model reliability"
          value={reliability}
          hint={result.cv_spearman != null ? `held-out corr ${result.cv_spearman.toFixed(2)}` : "too few runs"}
        />
        <Kpi label="Runs / inputs" value={`${result.n}/${result.d}`} />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <div>
          <SectionLabel>Drivers: dark bars raise, light bars lower {result.target}</SectionLabel>
          {missing.includes("drivers") ? <StaleSectionNote /> : <DriversBar drivers={result.drivers} />}
        </div>
        <div>
          <SectionLabel>Predicted vs measured (out-of-fold)</SectionLabel>
          {missing.includes("oof") ? <StaleSectionNote /> : <PredScatter oof={result.oof} />}
        </div>
      </div>

      {exp.provenance ? (
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-blue-soft px-3 py-2 font-mono text-[11px] text-muted">
          <span>seed {exp.provenance.seed}</span>
          <span>engine {exp.provenance.engine_version}</span>
          <span>processed {new Date(exp.provenance.processed_at).toLocaleString()}</span>
          {exp.provenance.noise_floor ? (
            <span>
              noise floor icc {fmt(exp.provenance.noise_floor.icc, 2)} / sigma {fmt(exp.provenance.noise_floor.sigma, 3)}
            </span>
          ) : null}
        </div>
      ) : null}

      <SectionLabel>Recommended next experiments</SectionLabel>
      {missing.includes("proposals") ? (
        <StaleSectionNote />
      ) : result.proposals.length ? (
        <Proposals
          cols={result.proposal_features}
          rows={result.proposals}
          predHead={`pred. ${result.target}`}
          predFn={(p) => `${fmt(p.pred, 2)} +/- ${fmt(p.std, 2)}`}
        />
      ) : (
        <p className="py-10 text-center text-[12px] text-muted">no proposals</p>
      )}
    </Card>
  );
}

/** Shown in place of a chart/table section whose backing field is missing
 *  from a persisted result (see `missingResultSections` in lib/experiments.ts) -
 *  a graceful note instead of passing `undefined` into a chart that throws. */
function StaleSectionNote() {
  return <p className="py-10 text-center text-[12px] text-muted">This result predates the current analysis schema.</p>;
}
