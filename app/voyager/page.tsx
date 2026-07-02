import { Building2, Pencil, Plus } from "lucide-react";
import { CUSTOMERS, type Customer } from "./data";
import { ProjectCard, AddProjectCard } from "@/components/voyager/project-card";

function CustomerSection({ customer }: { customer: Customer }) {
  const n = customer.projects.length;
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="size-3.5 text-[color:rgba(17,17,17,0.3)]" />
          <span className="text-[13px] font-medium text-[color:var(--v-ink)]">{customer.name}</span>
          <span className="v-tag">
            {n} project{n === 1 ? "" : "s"}
          </span>
        </div>
        <button type="button" className="v-btn v-btn-ghost">
          <Pencil className="size-[11px]" />
          Edit
        </button>
      </div>
      <div className="grid grid-cols-1 gap-[9px] sm:grid-cols-2 lg:grid-cols-3">
        {customer.projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
        <AddProjectCard />
      </div>
    </section>
  );
}

export default function VoyagerProjectsPage() {
  return (
    <div>
      <div className="mb-[18px] flex items-center justify-between">
        <div>
          <div className="v-eyebrow mb-0.5">All customers</div>
          <h1 className="v-title">Projects</h1>
        </div>
        <button type="button" className="v-btn v-btn-primary">
          <Plus className="size-3" />
          Add customer
        </button>
      </div>

      {CUSTOMERS.map((c) => (
        <CustomerSection key={c.id} customer={c} />
      ))}
    </div>
  );
}
