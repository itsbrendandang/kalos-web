import Link from "next/link";
import { Upload } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { LiveWorkbench } from "@/components/workbench/live-workbench";
import { buttonVariants } from "@/components/ui/button";

// Interim campaign home: the Live workbench, until the Overview is built.
export default function CampaignHome() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Campaign"
        title="Experiments"
        desc="Plan, run, and track every experiment."
        action={
          <Link href="/campaign/setup" className={buttonVariants()}>
            <Upload />
            Run analysis
          </Link>
        }
      />
      <LiveWorkbench />
    </div>
  );
}
