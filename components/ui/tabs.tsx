"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/** In-page tabs (views of one thing). The editor tab strip is the shell's, not this. */
function Tabs({ className, orientation = "horizontal", ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("group/tabs flex gap-3 data-horizontal:flex-col", className)}
      {...props}
    />
  );
}

const tabsListVariants = cva("group/tabs-list inline-flex w-fit items-center text-fg-muted", {
  variants: {
    variant: {
      default: "h-9 gap-1 rounded-lg bg-subtle p-1",
      line: "h-9 gap-4 border-b border-border",
      /* Campaign home only. Default and line are unchanged. */
      overview:
        "h-auto w-full justify-start gap-0 overflow-x-auto border-b border-overview-divider bg-transparent p-0 max-md:flex-col max-md:overflow-visible",
    },
  },
  defaultVariants: { variant: "default" },
});

function TabsList({ className, variant = "default", ...props }: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return <TabsPrimitive.List data-slot="tabs-list" data-variant={variant} className={cn(tabsListVariants({ variant }), className)} {...props} />;
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-full items-center justify-center gap-1.5 text-label whitespace-nowrap transition-colors hover:text-fg disabled:pointer-events-none disabled:text-fg-muted data-active:text-fg [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=default]/tabs-list:rounded-md group-data-[variant=default]/tabs-list:px-3 group-data-[variant=default]/tabs-list:data-active:bg-surface",
        // Line variant: the active tab gets an underline (shape, not just colour).
        "group-data-[variant=line]/tabs-list:after:absolute group-data-[variant=line]/tabs-list:after:inset-x-0 group-data-[variant=line]/tabs-list:after:-bottom-px group-data-[variant=line]/tabs-list:after:h-0.5 group-data-[variant=line]/tabs-list:data-active:after:bg-accent",
        "group-data-[variant=overview]/tabs-list:h-auto group-data-[variant=overview]/tabs-list:min-h-11 group-data-[variant=overview]/tabs-list:min-w-36 group-data-[variant=overview]/tabs-list:flex-1 group-data-[variant=overview]/tabs-list:flex-col group-data-[variant=overview]/tabs-list:items-start group-data-[variant=overview]/tabs-list:justify-center group-data-[variant=overview]/tabs-list:px-3 group-data-[variant=overview]/tabs-list:py-2 group-data-[variant=overview]/tabs-list:text-left group-data-[variant=overview]/tabs-list:font-medium group-data-[variant=overview]/tabs-list:whitespace-normal group-data-[variant=overview]/tabs-list:text-overview-fg-muted group-data-[variant=overview]/tabs-list:data-active:text-overview-fg",
        "group-data-[variant=overview]/tabs-list:after:absolute group-data-[variant=overview]/tabs-list:after:inset-x-3 group-data-[variant=overview]/tabs-list:after:-bottom-px group-data-[variant=overview]/tabs-list:after:h-0.5 group-data-[variant=overview]/tabs-list:data-active:after:bg-overview-action",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn("flex-1 outline-none", className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
