"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import type { Customer, Project, ProjectStatus } from "@/app/projects/data";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjectsStore } from "./store-context";

export type ModalState =
  | { kind: "add-customer" }
  | { kind: "edit-customer"; customer: Customer }
  | { kind: "add-project"; customerName?: string }
  | { kind: "edit-project"; project: Project }
  | null;

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "drafting", label: "Drafting" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "terminated", label: "Stopped" },
];

/** The dialog frame shared by the four forms: a title, one sentence, the fields, then Cancel and the one submit button. */
function Frame({
  title,
  description,
  submitLabel,
  valid,
  onSubmit,
  onClose,
  children,
}: {
  title: string;
  description: string;
  submitLabel: string;
  valid: boolean;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (valid) onSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
          <DialogFooter className="mt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-label text-fg">
      {label}
      {children}
      {hint ? <span className="text-caption font-normal text-fg-muted">{hint}</span> : null}
    </label>
  );
}

function StatusField({ value, onChange }: { value: ProjectStatus; onChange: (s: ProjectStatus) => void }) {
  return (
    <Field label="Status" hint="You can change this later.">
      <Select items={STATUS_OPTIONS} value={value} onValueChange={(v) => v && onChange(v as ProjectStatus)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function AddCustomerModal({ onClose }: { onClose: () => void }) {
  const { addCustomer } = useProjectsStore();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const valid = name.trim().length > 0;

  return (
    <Frame
      title="Add a customer"
      description="A customer groups its projects on the Projects page."
      submitLabel="Add the customer"
      valid={valid}
      onSubmit={() => {
        addCustomer({ name: name.trim(), address: address.trim() });
        onClose();
      }}
      onClose={onClose}
    >
      <Field label="Name">
        <Input placeholder="Acme Biopharma" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Address">
        <Input placeholder="123 Science Park, Cambridge, MA 02139" value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>
    </Frame>
  );
}

function EditCustomerModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { updateCustomer } = useProjectsStore();
  const [name, setName] = useState(customer.name);
  const [address, setAddress] = useState(customer.address);
  const valid = name.trim().length > 0;
  const n = customer.projects.length;

  return (
    <Frame
      title="Edit the customer"
      description={n === 0 ? "No projects yet." : `${n} ${n === 1 ? "project" : "projects"} under this customer.`}
      submitLabel="Save the changes"
      valid={valid}
      onSubmit={() => {
        updateCustomer(customer.id, { name: name.trim(), address: address.trim() });
        onClose();
      }}
      onClose={onClose}
    >
      <Field label="Name">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Address">
        <Input value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>
    </Frame>
  );
}

function AddProjectModal({ customerName, onClose }: { customerName?: string; onClose: () => void }) {
  const { addProject, customers } = useProjectsStore();
  const [customer, setCustomer] = useState(customerName ?? customers[0]?.name ?? "");
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("in_progress");
  const valid = name.trim().length > 0 && customer.length > 0;

  return (
    <Frame
      title="Add a project"
      description={customerName ? `Under ${customerName}.` : "Pick the customer it belongs to."}
      submitLabel="Add the project"
      valid={valid}
      onSubmit={() => {
        addProject(customer, { name: name.trim(), objective: objective.trim(), status });
        onClose();
      }}
      onClose={onClose}
    >
      {customerName ? null : (
        <Field label="Customer">
          <Select value={customer} onValueChange={(v) => v && setCustomer(v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <Field label="Name">
        <Input placeholder="CHO cell yield" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Objective" hint="What the project is trying to achieve, in one line.">
        <Input placeholder="Raise IgG titer at pilot scale" value={objective} onChange={(e) => setObjective(e.target.value)} />
      </Field>
      <StatusField value={status} onChange={setStatus} />
    </Frame>
  );
}

function EditProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const { updateProject } = useProjectsStore();
  const [name, setName] = useState(project.name);
  const [objective, setObjective] = useState(project.objective);
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const valid = name.trim().length > 0;

  return (
    <Frame
      title="Edit the project"
      description={`${project.customerName}: ${project.name}.`}
      submitLabel="Save the changes"
      valid={valid}
      onSubmit={() => {
        updateProject(project.id, { name: name.trim(), objective: objective.trim(), status });
        onClose();
      }}
      onClose={onClose}
    >
      <Field label="Name">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Objective">
        <Input value={objective} onChange={(e) => setObjective(e.target.value)} />
      </Field>
      <StatusField value={status} onChange={setStatus} />
    </Frame>
  );
}

export function ProjectsModal({ state, onClose }: { state: ModalState; onClose: () => void }) {
  if (!state) return null;
  if (state.kind === "add-customer") return <AddCustomerModal onClose={onClose} />;
  if (state.kind === "edit-customer") return <EditCustomerModal customer={state.customer} onClose={onClose} />;
  if (state.kind === "add-project") return <AddProjectModal customerName={state.customerName} onClose={onClose} />;
  return <EditProjectModal project={state.project} onClose={onClose} />;
}
