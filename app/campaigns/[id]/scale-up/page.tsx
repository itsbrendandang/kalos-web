"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Link2 } from "lucide-react";
import { Callout } from "@/components/kit/callout";
import { PageHeader } from "@/components/kit/page-header";
import { Section } from "@/components/kit/section";
import { CurrentStageControl } from "@/components/scale/current-stage-control";
import { GatePanel, type EvidenceOption } from "@/components/scale/gate-panel";
import { ReadoutTool } from "@/components/scale/readout-tool";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { StageGateTrack } from "@/components/viz/charts/stage-gate-track";
import { useCampaign, useCampaignDetail, useCampaignId, useLatest } from "@/hooks/use-engine";
import { useLatestLoad, type Fetched } from "@/hooks/use-latest-load";
import { getGates, getStages, type GateView, type GatesView, type StagesView } from "@/lib/api";
import { EngineError, engineMessage } from "@/lib/engine-error";
import type { ScaleReadout } from "@/lib/scale-readout";
import { stageBandsFromStages, type LadderStages } from "@/lib/viz-data/scale-ladder";
import { analysisEvidence, analysisRefreshKey, readoutEvidence, recordedAt, runEvidence, toStageTrack } from "@/lib/viz-data/stage-gate";

const TITLE = "Scale-up track";
const DESCRIPTION =
  "Where this campaign stands on the path to scale, and the go/no-go call your team recorded at each gate. Kalos shows its computed evidence beside each gate; the decision is always a person's.";

type Loaded = { stages: StagesView; gates: GatesView };

const optionKey = (o: { kind: string; id: string }) => `${o.kind}:${o.id}`;

/**
 * A campaign's scale-up track (C11) from GET /stages + GET /gates, with the
 * gate panel (computed evidence apart from the recorded decision) and the
 * scale-up readout tool, so a readout run here can be linked to a decision.
 * The current stage is set by a person; a no-go pauses the later stages and
 * nothing advances on its own. Archived campaigns are read-only.
 */
export default function CampaignScaleUpPage() {
  const id = useCampaignId();
  const detail = useCampaignDetail();
  const latest = useLatest();
  const campaign = useCampaign();
  const [selectedGate, setSelectedGate] = useState<string | null>(null);
  const [readouts, setReadouts] = useState<{ readout: ScaleReadout; fileName: string | null }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const gateRef = useRef<HTMLDivElement | null>(null);

  const fetchAll = useCallback(async (): Promise<Fetched<Loaded>> => {
    try {
      const [stages, gates] = await Promise.all([getStages(id), getGates(id)]);
      return { status: "data", data: { stages, gates } };
    } catch (e) {
      return { status: "error", message: engineMessage({ code: e instanceof EngineError ? e.code : "engine_error" }).message };
    }
  }, [id]);

  // Gate evidence is computed from the latest analysis: refetch when an analysis arrives or is replaced.
  const { load, reload, update } = useLatestLoad(fetchAll, analysisRefreshKey(latest.data));

  const archived = detail.data?.campaign.archived === true;
  const readOnlyReason = archived ? "This campaign is archived, so it is read-only: decisions and the current stage cannot be changed." : null;

  const track = useMemo(() => (load.status === "data" ? toStageTrack(load.data.stages, load.data.gates) : null), [load]);
  const ladderStages = useMemo<LadderStages | undefined>(
    () => (load.status === "data" ? { bands: stageBandsFromStages(load.data.stages.stages), source: load.data.stages.source === "campaign" ? "campaign" : "default" } : undefined),
    [load],
  );
  // The gate shown: the person's pick, else the current stage's gate, else the first open gate, else the first.
  const gateKey =
    selectedGate && track?.stages.some((s) => s.key === selectedGate)
      ? selectedGate
      : (track?.currentStage ?? track?.stages.find((s) => s.gate.state === "open")?.key ?? track?.stages[0]?.key ?? null);
  const stageIndex = track && gateKey ? track.stages.findIndex((s) => s.key === gateKey) : -1;
  const gateView: GateView | null = load.status === "data" && gateKey ? (load.data.gates.gates.find((g) => g.key === gateKey) ?? null) : null;

  const evidenceOptions: EvidenceOption[] = useMemo(() => {
    const out: EvidenceOption[] = [];
    const a = latest.data && latest.data.has_data ? analysisEvidence(latest.data) : null;
    if (a) out.push({ ref: a, detail: "The campaign's current analysis (its provenance hash)." });
    for (const r of readouts) out.push({ ref: readoutEvidence(r.readout), detail: `Run on this page${r.fileName ? ` from ${r.fileName}` : ""}; the readout id is stable for the same sheet and inputs.` });
    const pending = campaign.data && campaign.data.has_campaign ? campaign.data.pending : [];
    for (const run of pending.slice(-12).reverse()) out.push({ ref: runEvidence(run) });
    return out;
  }, [latest.data, readouts, campaign.data]);

  const toggle = useCallback((k: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const onRecorded = useCallback(
    (gate: GateView) => {
      update((d) => ({ ...d, gates: { ...d.gates, gates: d.gates.gates.map((g) => (g.key === gate.key ? gate : g)) } }));
      setSelected(new Set());
      void reload();
    },
    [reload, update],
  );

  const onReadout = useCallback((readout: ScaleReadout, fileName: string | null) => {
    setReadouts((prev) => [{ readout, fileName }, ...prev.filter((r) => r.readout.readout_id !== readout.readout_id)].slice(0, 5));
  }, []);

  const linkReadout = useCallback(
    (readout: ScaleReadout) => {
      setSelected((prev) => new Set(prev).add(optionKey(readoutEvidence(readout))));
      gateRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [],
  );

  return (
    <div className="flex min-w-0 flex-col gap-10">
      <PageHeader title={TITLE} description={DESCRIPTION} />

      {archived ? (
        <Callout title="This campaign is archived">It can be read but not changed: the current stage and gate decisions are shown as recorded.</Callout>
      ) : null}

      <Section id="track" title="Stages and gates" description="Each stage ends in a gate. A filled diamond is a decision your team recorded; a hollow one is an open gate.">
        {load.status === "loading" ? (
          <LoadingSkeleton rows={4} label="Loading the stage track" />
        ) : load.status === "error" ? (
          <ErrorState description={`${load.message} This is a connection problem, not a result.`} onRetry={() => void reload()} />
        ) : track ? (
          <div className="flex flex-col gap-6">
            {load.staleReason ? (
              <Callout
                tone="warn"
                title="These gates may be out of date"
                action={
                  <Button variant="outline" size="sm" onClick={() => void reload()}>
                    Retry
                  </Button>
                }
              >
                {`Refreshing the stages and gates failed, so the evidence shown is from an earlier read. ${load.staleReason}`}
              </Callout>
            ) : null}
            <StageGateTrack track={track} selectedGate={gateKey} onSelectGate={setSelectedGate} />
            <CurrentStageControl
              key={`${load.data.stages.current_stage}-${load.data.stages.updated_at}`}
              campaignId={id}
              view={load.data.stages}
              readOnly={archived}
              onSaved={(stages) => {
                update((d) => ({ ...d, stages }));
                void reload();
              }}
            />
          </div>
        ) : null}
      </Section>

      {track && gateKey && stageIndex >= 0 ? (
        <div ref={gateRef} className="scroll-mt-6">
          <GatePanel
            campaignId={id}
            stage={track.stages[stageIndex]}
            nextStage={track.stages[stageIndex + 1] ?? null}
            gate={gateView}
            readOnly={archived}
            readOnlyReason={readOnlyReason}
            evidenceOptions={evidenceOptions}
            selected={selected}
            onToggleEvidence={toggle}
            onRecorded={onRecorded}
          />
        </div>
      ) : null}

      {track && track.orphaned.length ? (
        <Section id="orphaned" title="Gates no longer in the stage list" description="Decisions recorded at stages that were later removed. They are kept, read-only.">
          <ul className="flex flex-col gap-1 text-body text-fg">
            {track.orphaned.map((g) => (
              <li key={g.key}>
                Gate {g.key}: {g.current ? `${g.current.decision} by ${g.current.decided_by}, ${recordedAt(g.current.decided_at)}` : "no decision"} (
                {g.historyCount} recorded)
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section
        id="readout"
        title="Scale-up readout"
        description="Upload runs from at least three scales and name a larger target scale. The engine backtests itself on your own scale ladder against two naive baselines, then predicts the target with an interval or refuses and says what data is missing. A readout run here can be linked to a gate decision."
      >
        <ReadoutTool
          stages={ladderStages}
          onReadout={onReadout}
          readoutActions={
            archived
              ? undefined
              : (r) => (
                  <Button size="sm" onClick={() => linkReadout(r)}>
                    <Link2 />
                    Link to the gate {gateKey ?? ""} decision
                  </Button>
                )
          }
        />
      </Section>
    </div>
  );
}
