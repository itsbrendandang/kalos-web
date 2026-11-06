"use client";

import { useState } from "react";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { SEED_PROJECT_IDS, stageLabel } from "@/app/projects/data";
import { PageHeader } from "@/components/kit/page-header";
import { Section } from "@/components/kit/section";
import { ExampleBadge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/honest-state";
import { ProjectsModal, type ModalState } from "./modals";
import { useProjectsStore } from "./store-context";

/**
 * One project: its name, objective and stage in the header, then the
 * experiments recorded under it and any notes. The live project is the
 * campaign the engine is scoring, so its one action opens the Overview.
 */
export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const store = useProjectsStore();
  const project = store.getProject(projectId);
  const [modal, setModal] = useState<ModalState>(null);

  if (!project) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader eyebrow="Projects" title="Project not found" description="This project is not in the list. It may have been added in another browser session." />
        <div>
          <Link href="/projects" className={buttonVariants({ variant: "outline" })}>
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  const seed = SEED_PROJECT_IDS.has(project.id);
  const n = project.experiments.length;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        className="max-sm:flex-col max-sm:items-start"
        eyebrow={
          <Link href="/projects" className="hover:text-accent">
            {project.customerName}
          </Link>
        }
        title={project.name}
        description={`${project.objective}. ${stageLabel(project.stage)}.`}
        meta={seed ? <ExampleBadge /> : null}
        action={
          project.live ? (
            <Link href="/" className={buttonVariants()}>
              Open the campaign
            </Link>
          ) : (
            <Button variant="outline" onClick={() => setModal({ kind: "edit-project", project })}>
              Edit the project
            </Button>
          )
        }
      />

      <Section title="Experiments" description={n === 0 ? undefined : `${n} recorded under this project.`}>
        {n === 0 ? (
          <EmptyState
            icon={FlaskConical}
            title="No experiments recorded"
            description={project.live ? "This project's runs are in the campaign. Open it to see them." : "Experiments appear here once they are recorded under this project."}
          />
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {project.experiments.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-4 py-3">
                <span className="text-body text-fg">{e.name}</span>
                <span className="font-mono text-code text-fg-muted">{e.id}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {project.notes ? (
        <Section title="Notes">
          <p className="max-w-[68ch] text-body text-fg">{project.notes}</p>
        </Section>
      ) : null}

      <ProjectsModal state={modal} onClose={() => setModal(null)} />
    </div>
  );
}
