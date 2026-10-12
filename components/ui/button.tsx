import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * shadcn Button on Base UI, in the Kalos tokens. One `default` (primary,
 * accent fill) per view: the page's primary action. `buttonVariants` styles a
 * Link as a button. Focus uses the global :focus-visible ring. Disabled
 * buttons change fill and ink instead of fading, so their label stays legible.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent text-label font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:border-border disabled:bg-subtle disabled:text-fg-muted data-disabled:pointer-events-none data-disabled:border-border data-disabled:bg-subtle data-disabled:text-fg-muted [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-fg hover:bg-accent-hover",
        outline: "border-border-strong bg-surface text-fg hover:bg-subtle",
        ghost: "text-fg hover:bg-subtle",
        secondary: "bg-subtle text-fg hover:bg-border",
        destructive: "border-bad bg-surface text-bad hover:bg-bad-soft",
        link: "h-auto px-0 text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3",
        lg: "h-10 px-5 text-body font-medium",
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
  return <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
