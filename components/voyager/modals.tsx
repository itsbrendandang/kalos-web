"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { Pencil, Plus, X } from "lucide-react";
import type { Customer, Project } from "@/app/voyager/data";

export type ModalState =
  | { kind: "add-customer" }
  | { kind: "edit-customer"; customer: Customer }
  | { kind: "add-project"; customerName: string }
  | { kind: "edit-project"; project: Project }
  | null;

function statusValue(s: Project["status"]): string {
  return { drafting: "Drafting", in_progress: "In Progress", completed: "Completed", terminated: "Terminated" }[s];
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps Tab/Shift+Tab focus within the given container while it is mounted,
 * moves focus into it on mount, and restores focus to whatever was focused
 * beforehand on unmount. Also marks the rest of the page inert so screen
 * readers and Tab can't reach it while the modal is open.
 */
function useFocusTrap(containerRef: React.RefObject<HTMLElement | null>) {
  // Captured once per mount (lazy initializer), not inside the effect below -
  // React Strict Mode's dev-only mount/cleanup/remount would otherwise let
  // the effect's second run capture the modal's own (already-focused) field
  // as "previously focused" instead of the real trigger element.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  if (previouslyFocusedRef.current === null) {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
  }

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // The modal renders inline in the page tree (no portal), so the trigger
    // button and the rest of the page live alongside it under shared
    // ancestors (e.g. .voyager-root). Marking only document.body's direct
    // children inert would miss all of that. Instead walk up from the modal
    // to <body>, marking every other sibling inert at each level.
    const siblings: HTMLElement[] = [];
    for (let node: HTMLElement | null = container; node && node !== document.body; node = node.parentElement) {
      const parent = node.parentElement;
      if (!parent) break;
      Array.from(parent.children).forEach((el) => {
        if (el !== node && el instanceof HTMLElement) siblings.push(el);
      });
    }
    siblings.forEach((el) => el.setAttribute("inert", ""));

    const focusables = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
    // Respect a field's own `autoFocus` (e.g. the name input): React applies
    // that during the same commit, before this layout effect runs, so if
    // focus already landed inside the container we leave it alone.
    if (!container.contains(document.activeElement)) {
      (focusables()[0] ?? container).focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !container) return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    container.addEventListener("keydown", onKeyDown);

    return () => {
      container.removeEventListener("keydown", onKeyDown);
      siblings.forEach((el) => el.removeAttribute("inert"));
      previouslyFocusedRef.current?.focus();
    };
  }, [containerRef]);
}

function Shell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="mhdr">
          <div>
            <div className="mt">{title}</div>
            <div className="ms">{subtitle}</div>
          </div>
          <button className="mx" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="mbody">{children}</div>
      </div>
    </div>
  );
}

const STATUS_OPTIONS = ["Drafting", "In Progress", "Completed", "Terminated"];

export function VoyagerModal({ state, onClose }: { state: ModalState; onClose: () => void }) {
  if (!state) return null;

  if (state.kind === "add-customer") {
    return (
      <Shell title="Add customer" subtitle="Creates a new customer workspace" onClose={onClose}>
        <div className="fg">
          <div className="fl">Customer name</div>
          <input className="fi" placeholder="e.g. Acme Biopharma" autoFocus />
        </div>
        <div className="fg">
          <div className="fl">Customer address</div>
          <input className="fi" placeholder="123 Science Park, Cambridge, MA 02139" />
        </div>
        <div className="macts">
          <button className="btn-c" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-s" onClick={onClose}>
            Create customer
          </button>
        </div>
      </Shell>
    );
  }

  if (state.kind === "edit-customer") {
    const c = state.customer;
    return (
      <Shell title="Edit customer" subtitle={c.name} onClose={onClose}>
        <div className="fg">
          <div className="fl">Customer name</div>
          <input className="fi" defaultValue={c.name} />
        </div>
        <div className="fg">
          <div className="fl">Customer address</div>
          <input className="fi" defaultValue={c.address} />
        </div>
        <div className="my-3 h-px bg-[color:var(--v-border)]" />
        <div className="mb-1.5 text-[10px] font-medium uppercase text-[color:var(--v-muted)]">
          Projects
        </div>
        {c.projects.map((p) => (
          <div
            key={p.id}
            className="mb-1.5 flex items-center gap-2 rounded-[7px] border-[0.5px] border-[color:var(--v-border)] bg-[var(--v-surface)] px-2 py-1.5"
          >
            <span
              className={`size-[5px] shrink-0 rounded-full ${
                p.stage.kind === "phase2" ? "v-stage-dot--phase2" : "v-stage-dot--phase1"
              }`}
            />
            <span className="flex-1 text-[12px] font-medium text-[color:var(--v-ink)]">{p.name}</span>
            <span
              className={`rounded-full px-[5px] py-0.5 text-[9px] font-medium ${
                p.stage.kind === "phase2" ? "v-stage-pill--phase2" : "v-stage-pill--phase1"
              }`}
            >
              {p.stage.kind === "phase2" ? "Phase 2" : "Phase 1"}
            </span>
          </div>
        ))}
        <div className="macts mt-3">
          <button className="btn-c" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-s" onClick={onClose}>
            Save changes
          </button>
        </div>
      </Shell>
    );
  }

  if (state.kind === "add-project") {
    return (
      <Shell title="Add project" subtitle={state.customerName} onClose={onClose}>
        <div className="fg">
          <div className="fl">Project name</div>
          <input className="fi" placeholder="e.g. CHO Cell Yield Optimization" autoFocus />
        </div>
        <div className="fg">
          <div className="fl">Project objective</div>
          <input className="fi" placeholder="What is this project trying to achieve?" />
        </div>
        <div className="fg">
          <div className="fl">Project status</div>
          <select className="fsel" defaultValue="In Progress">
            {STATUS_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <div className="fhint">Status can be updated at any time. Setting to Completed triggers report generation.</div>
        </div>
        <div className="macts">
          <button className="btn-c" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-s" onClick={onClose}>
            Create project
          </button>
        </div>
      </Shell>
    );
  }

  const p = state.project;
  return (
    <Shell title="Edit project" subtitle={`${p.customerName} · ${p.name}`} onClose={onClose}>
      <div className="fg">
        <div className="fl">Project name</div>
        <input className="fi" defaultValue={p.name} />
      </div>
      <div className="fg">
        <div className="fl">Project objective</div>
        <input className="fi" defaultValue={p.objective} />
      </div>
      <div className="fg">
        <div className="fl">Project status</div>
        <select className="fsel" defaultValue={statusValue(p.status)}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <div className="fhint">Setting to Completed triggers automatic report generation. Not permanent; can be changed back.</div>
      </div>
      <div className="macts">
        <button className="btn-c" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-s" onClick={onClose}>
          Save changes
        </button>
      </div>
    </Shell>
  );
}

export { Pencil, Plus };
