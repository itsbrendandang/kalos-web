import type { Metadata } from "next";
import "./projects.css";
import { ProjectsStoreProvider } from "@/components/projects/store-context";

export const metadata: Metadata = {
  title: "Projects",
  description: "Closed-loop bioprocess optimization - customer projects",
};

// The Projects surface renders inside the shared AppShell sidebar (see components/app-shell.tsx)
// instead of carrying its own top bar - this wrapper only keeps the projects-root
// token scope that the ported component styles expect. The font is the app-wide Geist.
//
// ProjectsStoreProvider is mounted here (not per-page) so the client-side
// customers/projects store survives navigation between the index and the
// per-project workspace routes - see components/projects/store-context.tsx.
export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="projects-root">
      <div className="mx-auto max-w-[1120px] px-6 py-7">
        <ProjectsStoreProvider>{children}</ProjectsStoreProvider>
      </div>
    </div>
  );
}
