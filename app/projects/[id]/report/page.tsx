import { getProject, allProjectIds } from "@/app/projects/data";
import { ProjectReport } from "@/components/projects/project-report";

export function generateStaticParams() {
  return allProjectIds()
    .filter((id) => getProject(id)?.report)
    .map((id) => ({ id }));
}

// ProjectReport resolves the live project from the client-side store itself
// (see components/projects/store-context.tsx) and renders its own "not found"
// state, so this route doesn't 404 on the server - see the sibling
// projects/[id]/page.tsx for why.
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectReport projectId={id} />;
}
