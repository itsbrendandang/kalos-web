import { PageHeader } from "@/components/page-header";
import { ExperimentsQueue } from "@/components/experiments/experiments-queue";

/** The experiment registry: the run sheets staged against the kalos portal's
 *  `/api/experiments/*` routes (the M2 contract), with their DRAFT -> READY ->
 *  PROCESSING -> DONE lifecycle and the batch "run all ready" action.
 *
 *  This used to be a redirect into the Experiments hub's Table view at
 *  `/?view=table`. The hub is gone, so the queue is back at its own URL - the
 *  body is the same `ExperimentsQueue` component, unchanged.
 *
 *  It is deliberately NOT folded into the campaign workspace: the workspace's
 *  New campaign dialog analyses one file immediately (`POST /api/run`) and
 *  seeds a campaign from it, which is a different thing from staging a named,
 *  persisted experiment for deferred batch execution and reading back its
 *  per-run provenance (seed, engine version, noise floor). */
export default function ExperimentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Lab"
        title="Experiments"
        desc="Run sheets staged against the engine, and the analysis each one produced."
      />
      <ExperimentsQueue />
    </div>
  );
}
