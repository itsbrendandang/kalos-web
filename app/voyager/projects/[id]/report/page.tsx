import { notFound } from "next/navigation";
import { getProject, allProjectIds } from "@/app/voyager/data";
import { ProjectReport } from "@/components/voyager/project-report";

export function generateStaticParams() {
  return allProjectIds()
    .filter((id) => getProject(id)?.report)
    .map((id) => ({ id }));
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project || !project.report) notFound();
  return <ProjectReport project={project} />;
}
