import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "ghost";
type Size = "default" | "sm";

const variants: Record<Variant, string> = {
  default:
    "bg-accent text-white shadow-[0_1px_2px_rgba(32,74,244,.25)] hover:bg-accent-hover",
  outline: "border border-border bg-card hover:bg-bg",
  ghost: "hover:bg-bg",
};
const sizes: Record<Size, string> = {
  default: "h-9 px-4 text-[13px]",
  sm: "h-8 px-3 text-xs",
};

export function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold whitespace-nowrap transition-colors disabled:opacity-55 disabled:cursor-wait [&_svg]:size-4 [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
