import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Small status label. `tone` carries meaning (neutral, accent, good, warn,
 * bad) and is never the only signal: the badge text says the state in words,
 * and an icon child is welcome. `variant` is the fill: soft (tinted) or
 * outline (hairline only).
 */
const badgeVariants = cva(
  "inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full border px-2 text-caption font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3.5",
  {
    variants: {
      tone: {
        neutral: "",
        accent: "",
        good: "",
        warn: "",
        bad: "",
      },
      variant: {
        soft: "border-transparent",
        outline: "bg-transparent",
      },
    },
    compoundVariants: [
      { variant: "soft", tone: "neutral", className: "bg-subtle text-fg" },
      { variant: "soft", tone: "accent", className: "bg-accent-soft text-accent" },
      { variant: "soft", tone: "good", className: "bg-good-soft text-good" },
      { variant: "soft", tone: "warn", className: "bg-warn-soft text-warn" },
      { variant: "soft", tone: "bad", className: "bg-bad-soft text-bad" },
      { variant: "outline", tone: "neutral", className: "border-border-strong text-fg-muted" },
      { variant: "outline", tone: "accent", className: "border-accent text-accent" },
      { variant: "outline", tone: "good", className: "border-good text-good" },
      { variant: "outline", tone: "warn", className: "border-warn text-warn" },
      { variant: "outline", tone: "bad", className: "border-bad text-bad" },
    ],
    defaultVariants: { tone: "neutral", variant: "soft" },
  },
);

function Badge({
  className,
  tone = "neutral",
  variant = "soft",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">({ className: cn(badgeVariants({ tone, variant }), className) }, props),
    render,
    state: { slot: "badge", tone, variant },
  });
}

/**
 * The one Explore/Exploit label, identical everywhere: Exploit is the model's
 * confident bet (accent), Explore is information-gathering (neutral outline).
 */
function ModeBadge({ mode, className }: { mode: "explore" | "exploit"; className?: string }) {
  return mode === "exploit" ? (
    <Badge tone="accent" className={className}>
      Exploit
    </Badge>
  ) : (
    <Badge tone="neutral" variant="outline" className={className}>
      Explore
    </Badge>
  );
}

/** The visible label on demo or illustrative content (honesty rule 8). */
function ExampleBadge({ className }: { className?: string }) {
  return (
    <Badge tone="warn" variant="outline" className={className}>
      Example data
    </Badge>
  );
}

export { Badge, badgeVariants, ExampleBadge, ModeBadge };
