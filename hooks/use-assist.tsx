"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import { localNextStep } from "@/lib/agent";
import { askAssist, getAssistIndexStatus, getAssistNext } from "@/lib/api";
import { AssistUnavailableError, type AssistAnswer, type AssistIndexStatus, type AssistNext, type AssistUnavailableReason } from "@/lib/assist";
import { DEMO_MODE } from "@/lib/demo";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import { campaignView } from "@/lib/workbench";

/**
 * The next step, from the engine's guide (GET /api/assist/next) when the
 * engine has it, else worked out here from the campaign (lib/agent.ts). The
 * card cannot tell the two apart; `source` says which it was, for tests and
 * the Why line. Null while the campaign itself is still loading, or when the
 * engine could not be reached at all (the page shows its own error then).
 */
export type NextStepState = {
  next: AssistNext | null;
  source: "engine" | "local" | null;
  loading: boolean;
};

/**
 * The index status (GET /api/assist/index/status): which model answers, where
 * it runs, what is indexed. `reason` is set when the engine has no assistant
 * ("absent" on an older engine) or says it is off; `error` when the request
 * itself failed.
 */
export type AssistStatusState = {
  status: AssistIndexStatus | null;
  reason: AssistUnavailableReason | null;
  error: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  set: (next: AssistIndexStatus) => void;
};

/** One question and what came back. */
export type Turn = { id: number; question: string; reply: { kind: "answer"; answer: AssistAnswer } | { kind: "failed"; text: string } | { kind: "pending" } };

/**
 * The one conversation, shared by the Overview in Simple view, the Ask Kalos
 * panel and the Ask Kalos page, so a question asked in one place is answered
 * in all of them. `off` becomes true when the engine says the assistant is
 * turned off mid-conversation.
 */
export type ThreadState = {
  turns: Turn[];
  busy: boolean;
  off: boolean;
  ask: (question: string) => Promise<void>;
};

export const MAX_QUESTION = 2000;

type AssistData = {
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  nextStep: NextStepState;
  assistStatus: AssistStatusState;
  thread: ThreadState;
};

const AssistContext = createContext<AssistData | null>(null);

function useNextStep(): NextStepState {
  const latest = useLatest();
  const campaign = useCampaign();
  // null: not asked yet; { next: null }: the engine has no guide (older engine, or the request failed), so the local one is shown.
  const [engine, setEngine] = useState<{ next: AssistNext | null } | null>(null);
  const ticket = useRef(0);

  const view = campaignView(campaign.data, campaign.error, DEMO_MODE, DEMO_CAMPAIGN);
  const ready = view.state !== "loading" && view.state !== "error" && latest.data != null && !latest.error;
  const demo = view.state === "data" && view.demo;

  // Ask the engine again whenever the campaign or analysis changes (a write refreshes both).
  useEffect(() => {
    if (!ready || demo) return;
    const mine = ++ticket.current;
    getAssistNext().then(
      (next) => mine === ticket.current && setEngine({ next }),
      () => mine === ticket.current && setEngine({ next: null }),
    );
  }, [ready, demo, latest.data, campaign.data]);

  return useMemo(() => {
    if (!ready) return { next: null, source: null, loading: view.state === "loading" || latest.data == null };
    const active = view.state === "data" ? view.campaign : null;
    const local = () => localNextStep(demo ? { has_data: true } : latest.data!, active ?? { has_campaign: false });
    if (demo) return { next: local(), source: "local", loading: false };
    if (engine == null) return { next: null, source: null, loading: true };
    if (engine.next) return { next: engine.next, source: "engine", loading: false };
    return { next: local(), source: "local", loading: false };
  }, [ready, demo, engine, latest.data, view]);
}

function useAssistStatus(): AssistStatusState {
  const [state, setState] = useState<{ status: AssistIndexStatus | null; reason: AssistUnavailableReason | null; error: boolean; loading: boolean }>({
    status: null,
    reason: null,
    error: false,
    loading: true,
  });
  const ticket = useRef(0);
  const request = useCallback((mine: number) =>
    getAssistIndexStatus().then(
      (status) => {
        if (mine === ticket.current) setState({ status, reason: null, error: false, loading: false });
      },
      (e: unknown) => {
        if (mine !== ticket.current) return;
        if (e instanceof AssistUnavailableError) setState({ status: null, reason: e.reason, error: false, loading: false });
        else setState((s) => ({ ...s, error: true, loading: false }));
      },
    ), []);
  const refresh = useCallback(() => request(++ticket.current), [request]);
  useEffect(() => {
    const mine = ++ticket.current;
    void request(mine);
  }, [request]);
  const set = useCallback((status: AssistIndexStatus) => {
    ticket.current++;
    setState({ status, reason: null, error: false, loading: false });
  }, []);
  return { ...state, refresh, set };
}

function useThread(): ThreadState {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [off, setOff] = useState(false);
  const seq = useRef(0);
  const ask = useCallback(async (question: string) => {
    const q = question.trim().slice(0, MAX_QUESTION);
    if (!q) return;
    const id = ++seq.current;
    setTurns((t) => [...t, { id, question: q, reply: { kind: "pending" } }]);
    setBusy(true);
    try {
      const answer = await askAssist(q);
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, reply: { kind: "answer", answer } } : x)));
    } catch (err) {
      if (err instanceof AssistUnavailableError && err.reason !== "unavailable") {
        setOff(true);
        setTurns((t) => t.filter((x) => x.id !== id));
        return;
      }
      const text =
        err instanceof AssistUnavailableError
          ? "The model did not answer. Check that it is running, then ask again."
          : "Kalos could not be reached, so the question was not answered. Ask again in a moment.";
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, reply: { kind: "failed", text } } : x)));
    } finally {
      setBusy(false);
    }
  }, []);
  return useMemo(() => ({ turns, busy, off, ask }), [turns, busy, off, ask]);
}

/** Mounted once by the app shell, inside EngineDataProvider. */
export function AssistProvider({ children }: { children: ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const nextStep = useNextStep();
  const assistStatus = useAssistStatus();
  const thread = useThread();
  const value = useMemo(() => ({ panelOpen, setPanelOpen, nextStep, assistStatus, thread }), [panelOpen, nextStep, assistStatus, thread]);
  return <AssistContext.Provider value={value}>{children}</AssistContext.Provider>;
}

function useAssistData(): AssistData {
  const d = useContext(AssistContext);
  if (!d) throw new Error("useAssist* hooks need <AssistProvider> (mounted by the app shell)");
  return d;
}

/** The one next step for the campaign. */
export function useNextStepCard(): NextStepState {
  return useAssistData().nextStep;
}

/** Which model answers questions, and where it runs. */
export function useAssistIndexStatus(): AssistStatusState {
  return useAssistData().assistStatus;
}

/** The one conversation with Kalos. */
export function useAssistThread(): ThreadState {
  return useAssistData().thread;
}

/** The "Ask Kalos" panel: open from the sidebar or ⌘J. */
export function useAssistPanel(): { open: boolean; setOpen: (open: boolean) => void } {
  const { panelOpen, setPanelOpen } = useAssistData();
  return { open: panelOpen, setOpen: setPanelOpen };
}
