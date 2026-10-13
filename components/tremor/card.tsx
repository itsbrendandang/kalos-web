// Adapted from Tremor, https://github.com/tremorlabs/tremor, Apache-2.0 (see ./NOTICE).
// Source: src/components/Card/Card.tsx [v1.0.0].
// Modified: Kalos tokens (surface, hairline border, 12px radius, no shadow);
// Radix Slot `asChild` replaced by Base UI's `render` prop.

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@/lib/utils";

export function Card({ className, render, ...props }: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">({ className: cn("relative w-full rounded-xl border border-border bg-surface p-5 text-left", className) }, props),
    render,
  });
}
