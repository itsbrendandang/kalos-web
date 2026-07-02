import { Pencil, Plus, ChevronRight } from "lucide-react";
import type { Project, ProjectStage } from "@/app/voyager/data";

function phaseLabel(stage: ProjectStage): { text: string; cls: string } {
  switch (stage.kind) {
    case "phase1":
      return { text: `Phase 1 · Iter ${stage.iteration} of ${stage.totalIterations}`, cls: "v-phase--p1" };
    case "phase2":
      return { text: `Phase 2 · ${stage.label}`, cls: "v-phase--p2" };
    case "completed":
      return { text: "Completed", cls: "v-phase--done" };
    case "drafting":
      return { text: "Drafting", cls: "v-phase--draft" };
  }
}

export function ProjectCard({ project }: { project: Project }) {
  const phase = phaseLabel(project.stage);
  const isP2 = project.stage.kind === "phase2";

  // Whole-card navigation lands the user in the project's phase screen, which
  // is the next Voyager screen to build; the card is hover-ready for it.
  return (
    <div className={`v-card flex flex-col ${isP2 ? "v-card--p2" : ""}`}>
      <div className={`v-phase ${phase.cls} mb-1`}>{phase.text}</div>
      <div className="v-card-name mb-1">{project.name}</div>
      <div className="v-card-obj mb-2 flex-1">{project.objective}</div>
      <div className="v-card-ft">
        <button type="button" className="inline-flex items-center gap-1 text-[color:inherit] transition-colors hover:text-[color:var(--v-blue)]">
          <Pencil className="size-2.5" />
          Edit
        </button>
        <ChevronRight className="size-3.5 text-[color:rgba(17,17,17,0.2)]" />
      </div>
    </div>
  );
}

export function AddProjectCard() {
  return (
    <button type="button" className="v-add-card">
      <Plus className="size-[17px]" />
      <span className="text-[11px] font-medium">Add project</span>
    </button>
  );
}
