import type { Metadata } from "next";
import "./projects.css";

export const metadata: Metadata = {
  title: "Projects",
  description: "Closed-loop bioprocess optimization - customer projects",
};

// The shell (components/workbench/app-shell.tsx) provides the frame, the page
// padding and the projects store; this wrapper only keeps the .projects-root
// token scope that the ported Projects styles expect.
export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return <div className="projects-root">{children}</div>;
}
