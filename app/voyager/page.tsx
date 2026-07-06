"use client";

import { useState } from "react";
import { Building2, Pencil, Plus } from "lucide-react";
import { CUSTOMERS, type Customer } from "./data";
import { ProjectCard, AddProjectCard } from "@/components/voyager/project-card";
import { VoyagerModal, type ModalState } from "@/components/voyager/modals";

export default function VoyagerProjectsPage() {
  const [modal, setModal] = useState<ModalState>(null);

  return (
    <div>
      <div className="mb-[18px] flex items-center justify-between">
        <div>
          <div className="v-eyebrow mb-0.5">All customers</div>
          <h1 className="v-title">Projects</h1>
        </div>
        <button type="button" className="v-btn v-btn-primary" onClick={() => setModal({ kind: "add-customer" })}>
          <Plus className="size-3" />
          Add customer
        </button>
      </div>

      {CUSTOMERS.map((c) => (
        <CustomerSection key={c.id} customer={c} onModal={setModal} />
      ))}

      <VoyagerModal state={modal} onClose={() => setModal(null)} />
    </div>
  );
}

function CustomerSection({ customer, onModal }: { customer: Customer; onModal: (m: ModalState) => void }) {
  const n = customer.projects.length;
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="size-3.5 text-[color:var(--v-faint)]" />
          <span className="text-[13px] font-medium text-[color:var(--v-ink)]">{customer.name}</span>
          <span className="v-tag">
            {n} project{n === 1 ? "" : "s"}
          </span>
        </div>
        <button type="button" className="v-btn v-btn-ghost" onClick={() => onModal({ kind: "edit-customer", customer })}>
          <Pencil className="size-[11px]" />
          Edit
        </button>
      </div>
      <div className="grid grid-cols-1 gap-[9px] sm:grid-cols-2 lg:grid-cols-3">
        {customer.projects.map((p) => (
          <ProjectCard key={p.id} project={p} onEdit={(project) => onModal({ kind: "edit-project", project })} />
        ))}
        <AddProjectCard onClick={() => onModal({ kind: "add-project", customerName: customer.name })} />
      </div>
    </section>
  );
}
