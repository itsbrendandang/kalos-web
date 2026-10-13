import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/kit/page-header";
import { LIBRARY_ITEMS } from "@/lib/routes";

export default function LibraryPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Library" description="Standalone tools that work alongside the campaign." />
      <ul className="divide-y divide-border border-y border-border">
        {LIBRARY_ITEMS.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="group flex items-center gap-4 py-4 hover:bg-subtle sm:px-2">
              <span className="min-w-0 flex-1">
                <span className="block text-heading text-fg group-hover:text-accent">{item.label}</span>
                <span className="block text-body text-fg-muted">{item.description}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-fg-muted group-hover:text-accent" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
