"use client";

import { useState } from "react";
import { Building2, Pencil, Plus } from "lucide-react";
import type { Customer } from "./data";
import { ProjectCard, AddProjectCard } from "@/components/projects/project-card";
import { ProjectsModal, type ModalState } from "@/components/projects/modals";
import { useProjectsStore } from "@/components/projects/store-context";
import { PageHeader } from "@/components/kit/page-header";
import { ExampleBadge } from "@/components/ui/badge";

export default function ProjectsPage() {
  const [modal, setModal] = useState<ModalState>(null);
  const { customers } = useProjectsStore();

  return (
    <div>
      <PageHeader className="mb-8" eyebrow="Research portfolio" title="Projects" meta={<ExampleBadge />} description="Keep each client's objective, experiments, and reports in one place. Example workspaces are illustrative, not live research." action={
        <button type="button" className="v-btn v-btn-primary" onClick={() => setModal({ kind: "add-customer" })}>
          <Plus className="size-3" />
          Add customer
        </button>
      } />

      {customers.map((c) => (
        <CustomerSection key={c.id} customer={c} onModal={setModal} />
      ))}

      <ProjectsModal state={modal} onClose={() => setModal(null)} />
    </div>
  );
}

function CustomerSection({ customer, onModal }: { customer: Customer; onModal: (m: ModalState) => void }) {
  const n = customer.projects.length;
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="size-3.5 text-[color:var(--v-faint)]" />
          <h2 className="text-heading text-fg">{customer.name}</h2>
          <span className="v-tag">
            {n} project{n === 1 ? "" : "s"}
          </span>
        </div>
        <button type="button" className="v-btn v-btn-ghost" onClick={() => onModal({ kind: "edit-customer", customer })}>
          <Pencil className="size-[11px]" />
          Edit
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {customer.projects.map((p) => (
          <ProjectCard key={p.id} project={p} onEdit={(project) => onModal({ kind: "edit-project", project })} />
        ))}
        <AddProjectCard onClick={() => onModal({ kind: "add-project", customerName: customer.name })} />
      </div>
    </section>
  );
}
