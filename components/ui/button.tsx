import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * shadcn/Base UI Button, retuned to the kalos control language.
 *
 * Reconciliation notes (2026-08-08 shadcn migration):
 *  - MECHANISM is shadcn's: Base UI's Button primitive + cva, so `render` is
 *    available and future registry components that import `buttonVariants`
 *    behave as they expect.
 *  - GEOMETRY and VOCABULARY are kalos's, unchanged from the hand-rolled
 *    version this replaces: h-9 / px-4 / text-[13px] default, h-8 / px-3 /
 *    text-xs small, the 10px control radius, `disabled:cursor-wait`, and
 *    `[&_svg]:size-4`. base-nova's stock sizes (h-8 default, h-7 sm,
 *    rounded-lg) were NOT adopted - they would have shrunk every button in
 *    the app.
 *  - `accent` is kept as an alias of `default` because that is the name the
 *    kalos design docs use for the primary brand fill. No call site passes it
 *    explicitly today (the primary variant is always implicit), but the name
 *    stays valid so DESIGN.md's vocabulary keeps working.
 *  - base-nova reaches for `bg-muted` on quiet hovers. In this app `--muted`
 *    is a TEXT gray, so every such hover is rewritten to the kalos blue-soft
 *    surface. See the KNOWN DIVERGENCE note in app/globals.css.
 *  - Focus uses `ring`, which works because app/globals.css zeroes the
 *    box-shadow scale instead of forcing `box-shadow: none !important`.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px] border border-transparent bg-clip-padding font-semibold whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:cursor-wait disabled:opacity-55 data-disabled:cursor-wait data-disabled:opacity-55 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border-accent bg-accent text-primary-foreground hover:border-accent-hover hover:bg-accent-hover",
        accent: "border-accent bg-accent text-primary-foreground hover:border-accent-hover hover:bg-accent-hover",
        outline: "border-border bg-card text-fg hover:border-blue-border hover:bg-blue-soft",
        ghost: "text-fg hover:bg-blue-soft",
        secondary: "bg-secondary text-secondary-foreground hover:bg-blue-soft",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20",
        link: "text-accent-text underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 text-[13px]",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-5 text-sm",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
