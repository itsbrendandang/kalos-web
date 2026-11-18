import Link from "next/link";
import { ArrowUpRight, Beaker, ChartNoAxesCombined, Grid2X2, Microscope, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/kit/page-header";
import { VisualReadingGuide } from "@/components/workbench/visual-reading-guide";
import { LIBRARY_GROUPS, LIBRARY_ITEMS } from "@/lib/routes";

const ICONS: Record<string, LucideIcon> = { "/library/plate": Grid2X2, "/library/vessels": Microscope, "/library/scale-up": Beaker, "/library/simulator": ChartNoAxesCombined };

export default function LibraryPage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader title="Bioprocess tools" description="Choose a scientific task. Each tool keeps its inputs, assumptions, and results together." />
      {LIBRARY_GROUPS.map((group) => (
        <section key={group.label} className="flex flex-col gap-4">
          <header><h2 className="text-heading text-fg">{group.label}</h2><p className="mt-1 text-body text-fg-muted">{group.description}</p></header>
          <ul className="grid gap-4 lg:grid-cols-2">
            {group.hrefs.map((href) => {
              const item = LIBRARY_ITEMS.find((tool) => tool.href === href)!;
              const Icon = ICONS[href];
              return (
                <li key={href}>
                  <Link href={href} className="group flex h-full items-start gap-4 rounded-xl border border-border bg-surface p-5 hover:border-border-input hover:bg-subtle">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-subtle text-fg"><Icon className="size-5" aria-hidden /></span>
                    <span className="min-w-0 flex-1"><span className="block text-heading text-fg">{item.label}</span><span className="mt-1 block text-body text-fg-muted">{item.description}</span></span>
                    <ArrowUpRight className="mt-1 size-4 shrink-0 text-fg-muted group-hover:text-fg" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <VisualReadingGuide />
    </div>
  );
}
