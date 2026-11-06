"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Pencil } from "lucide-react";
import { SEED_PROJECT_IDS, stageLabel, type Customer, type Project } from "./data";
import { PageHeader } from "@/components/kit/page-header";
import { Section } from "@/components/kit/section";
import { Badge, ExampleBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/honest-state";
import { ProjectsModal, type ModalState } from "@/components/projects/modals";
import { useProjectsStore } from "@/components/projects/store-context";

/**
 * Projects: every customer's projects in one list, with the stage of each in
 * words. The seed projects are illustrative and badged as example data; what
 * the viewer adds lives in this browser session only.
 */
export default function ProjectsPage() {
  const [modal, setModal] = useState<ModalState>(null);
  const { customers } = useProjectsStore();
  const seeded = customers.some((c) => c.projects.some((p) => SEED_PROJECT_IDS.has(p.id)));

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Projects"
        description="Client projects and where each one stands. Saved in this browser."
        meta={seeded ? <ExampleBadge /> : null}
        action={
          <Button disabled={customers.length === 0} onClick={() => setModal({ kind: "add-project" })}>
            Add a project
          </Button>
        }
      />

      {customers.length === 0 ? (
        <EmptyState title="No customers yet" description="Add a customer, then add projects under it." />
      ) : (
        customers.map((c) => <CustomerSection key={c.id} customer={c} onModal={setModal} />)
      )}

      <div>
        <Button variant="outline" onClick={() => setModal({ kind: "add-customer" })}>
          Add a customer
        </Button>
      </div>

      <ProjectsModal state={modal} onClose={() => setModal(null)} />
    </div>
  );
}

function CustomerSection({ customer, onModal }: { customer: Customer; onModal: (m: ModalState) => void }) {
  const n = customer.projects.length;
  return (
    <Section
      id={`customer-${customer.id}`}
      title={customer.name}
      description={n === 0 ? "No projects yet" : `${n} ${n === 1 ? "project" : "projects"}`}
      actions={
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${customer.name}`} onClick={() => onModal({ kind: "edit-customer", customer })}>
          <Pencil aria-hidden />
        </Button>
      }
    >
      {n === 0 ? (
        <p className="text-body text-fg-muted">No projects under this customer yet.</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {customer.projects.map((p) => (
            <ProjectRow key={p.id} project={p} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function ProjectRow({ project }: { project: Project }) {
  return (
    <li>
      <Link
        href={`/projects/${project.id}`}
        className="-mx-2 flex items-center gap-4 rounded-lg px-2 py-3 hover:bg-fill-hover"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-heading text-fg">{project.name}</span>
          <span className="block text-body text-fg-muted">{project.objective}</span>
        </span>
        <Badge tone={project.stage.kind === "completed" ? "good" : project.stage.kind === "drafting" ? "neutral" : "accent"} className="shrink-0">
          {stageLabel(project.stage)}
        </Badge>
        <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden />
      </Link>
    </li>
  );
}
