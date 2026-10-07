import { allProjectIds } from "@/app/projects/data";
import { ProjectWorkspace } from "@/components/projects/project-workspace";

export function generateStaticParams() {
  return allProjectIds().map((id) => ({ id }));
}

// Projects created client-side (via the Projects UI) only exist in the
// browser's localStorage-backed store, not in this seed-derived static param
// list - ProjectWorkspace resolves the live project from that store itself,
// so this route intentionally never 404s on the server for an unknown id.
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectWorkspace projectId={id} />;
}
