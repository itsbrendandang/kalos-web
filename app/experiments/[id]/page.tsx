import { ExperimentDetail } from "@/components/experiments/experiment-detail";

// No generateStaticParams: experiments are created live against the portal, so
// this route resolves the id client-side (see ExperimentDetail) rather than
// prerendering a fixed id list, matching app/voyager/projects/[id]/page.tsx.
export default async function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExperimentDetail id={id} />;
}
