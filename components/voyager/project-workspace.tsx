"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, FileText, GitBranch } from "lucide-react";
import type { Project } from "@/app/voyager/data";
import { Phase1View } from "./phase1-view";
import { Phase2View } from "./phase2-view";
import { LinkageTree } from "./linkage-tree";

type Tab = "phase1" | "phase2" | "tree";

function subtitle(p: Project): string {
  switch (p.stage.kind) {
    case "phase1":
      return `${p.objective} · iteration ${p.stage.iteration} of ${p.stage.totalIterations}`;
    case "phase2":
      return `${p.objective} · ${p.experiments.length} experiments in DB`;
    case "completed":
      return `${p.objective} · completed ${p.stage.completedOn}`;
    case "drafting":
      return `${p.objective} · drafting`;
  }
}

export function ProjectWorkspace({ project }: { project: Project }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(project.defaultTab);

  return (
    <div>
      <button className="bb" onClick={() => router.push("/voyager")}>
        <ArrowLeft className="size-3" /> All projects
      </button>

      <div className="hdr2">
        <div>
          <div className="v-eyebrow mb-0.5">{project.customerName}</div>
          <h1 className="v-title">{project.name}</h1>
          <div className="mt-0.5 text-[12px] text-[color:rgba(17,17,17,0.4)]">{subtitle(project)}</div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button className="gbtn">
            <Pencil className="size-[11px]" /> Edit
          </button>
          {project.report ? (
            <Link className="gbtn" href={`/voyager/projects/${project.id}/report`}>
              <FileText className="size-[11px]" /> View report
            </Link>
          ) : null}
          <div className="ph-tabs">
            <button className={`phtab ${tab === "phase1" ? "on" : ""}`} onClick={() => setTab("phase1")}>
              Phase 1
            </button>
            <button className={`phtab ${tab === "phase2" ? "on" : ""}`} onClick={() => setTab("phase2")}>
              Phase 2
            </button>
            {project.hasTree ? (
              <button className={`phtab ${tab === "tree" ? "on" : ""}`} onClick={() => setTab("tree")}>
                <GitBranch className="mr-1 inline size-[11px] align-[-2px]" />
                Linkage tree
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {tab === "phase1" ? <Phase1View project={project} /> : null}
      {tab === "phase2" ? <Phase2View project={project} /> : null}
      {tab === "tree" && project.hasTree ? <LinkageTree variant={project.hasTree} /> : null}
    </div>
  );
}
