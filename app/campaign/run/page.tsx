import { PageHeader } from "@/components/page-header";
import { LiveWorkbench } from "@/components/workbench/live-workbench";

// Interim Run stage: the Live workbench's runs in flight, until this page is rebuilt.
export default function RunPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Campaign" title="Run" desc="Runs in flight and their recipes." />
      <LiveWorkbench />
    </div>
  );
}
