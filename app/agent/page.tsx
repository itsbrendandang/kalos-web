"use client";

import { AssistChat } from "@/components/assist/assist-chat";
import { NextStepFromEngine } from "@/components/assist/next-step-card";
import { PageHeader } from "@/components/kit/page-header";
import { Section } from "@/components/kit/section";
import { ExampleBadge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/honest-state";
import { useCampaignStage } from "@/hooks/use-campaign-stage";

/**
 * Ask Kalos as a page: the one next step, then the question panel's body.
 * The same thing opens over any page from the sidebar or ⌘J. Runs in flight
 * live on the Run stage; how forecasts held up lives on Learn.
 */
export default function AskKalosPage() {
  const { status, demo, retry } = useCampaignStage();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Ask Kalos"
        meta={demo ? <ExampleBadge /> : null}
        description="What to do next, and answers about your own sheets, rounds and results. Every answer says where it came from."
      />
      {status === "offline" ? (
        <ErrorState title="Could not reach Kalos" description="The campaign could not be loaded. This is a connection problem, not an empty campaign." onRetry={retry} />
      ) : (
        <>
          <NextStepFromEngine />
          <Section title="Ask a question">
            <AssistChat showGuide={false} />
          </Section>
        </>
      )}
    </div>
  );
}
