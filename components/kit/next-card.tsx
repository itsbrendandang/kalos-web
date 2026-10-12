import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The one thing to do next, computed from campaign state (lib/campaign-stage).
 * The button names the action (verb + object) and links to its stage page.
 */
export function NextCard({
  action,
  href,
  reason,
  eyebrow = "Next step",
  className,
}: {
  action: string;
  href: string;
  reason: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label="Next step"
      className={cn("flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between", className)}
    >
      <div className="min-w-0">
        <p className="text-label text-accent">{eyebrow}</p>
        <p className="mt-1 text-heading text-fg">{action}</p>
        <p className="mt-0.5 max-w-[60ch] text-body text-fg-muted">{reason}</p>
      </div>
      <Link href={href} className={buttonVariants({ className: "shrink-0 self-start sm:self-center" })}>
        {action}
        <ArrowRight />
      </Link>
    </section>
  );
}
