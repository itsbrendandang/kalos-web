import { notFound } from "next/navigation";
import { getProject, allProjectIds } from "@/app/voyager/data";
import { ProjectWorkspace } from "@/components/voyager/project-workspace";

export function generateStaticParams() {
  return allProjectIds().map((id) => ({ id }));
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();
  return <ProjectWorkspace project={project} />;
}
