// COMPATIBILITY SHIM - delete once no page imports it. The pages not yet
// rebuilt still call the old PageHeader/DemoBadge/Loading names; they now
// render the kit versions. New code imports from components/kit/page-header
// and components/ui/badge (ExampleBadge) directly.
import { PageHeader as KitPageHeader } from "@/components/kit/page-header";
import { ExampleBadge } from "@/components/ui/badge";
import { LoadingSkeleton } from "@/components/ui/honest-state";

export function PageHeader({ eyebrow, title, desc, action }: { eyebrow?: string; title: string; desc?: string; action?: React.ReactNode }) {
  return <KitPageHeader eyebrow={eyebrow} title={title} description={desc} action={action} />;
}

export function DemoBadge() {
  return <ExampleBadge />;
}

export function Loading({ label = "Running analysis" }: { label?: string }) {
  return (
    <div className="py-6">
      <p className="mb-3 text-center text-caption text-fg-muted">{label}...</p>
      <LoadingSkeleton variant="rows" rows={4} label={label} className="mx-auto max-w-md" />
    </div>
  );
}
