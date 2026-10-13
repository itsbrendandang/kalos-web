"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * shadcn Table in the Kalos style: 40px rows, hairline rules, right-aligned
 * tabular numbers (`numeric` on TableHead and TableCell). The container
 * scrolls sideways on narrow screens, so columns never stack into cards.
 * The header is sticky inside the container: give `containerClassName` a max
 * height (e.g. "max-h-[480px]") for it to stick while rows scroll. Headers
 * paint the page colour; inside a Panel pass `className="bg-surface"`.
 */
function Table({ className, containerClassName, ...props }: React.ComponentProps<"table"> & { containerClassName?: string }) {
  return (
    <div data-slot="table-container" className={cn("relative w-full overflow-auto", containerClassName)}>
      <table data-slot="table" className={cn("w-full caption-bottom text-body", className)} {...props} />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b [&_tr]:border-border", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return <tfoot data-slot="table-footer" className={cn("border-t border-border font-medium [&>tr]:last:border-b-0", className)} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn("border-b border-border transition-colors hover:bg-subtle aria-selected:bg-accent-soft data-[state=selected]:bg-accent-soft", className)}
      {...props}
    />
  );
}

function TableHead({ className, numeric = false, ...props }: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "sticky top-0 z-10 h-10 bg-bg px-3 text-left align-middle text-label whitespace-nowrap text-fg-muted",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, numeric = false, ...props }: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn("h-10 px-3 py-2 align-middle whitespace-nowrap", numeric && "text-right tabular-nums", className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption data-slot="table-caption" className={cn("mt-3 text-caption text-fg-muted", className)} {...props} />;
}

export type SortDirection = "ascending" | "descending" | "none";

/**
 * A header cell that sorts its column. `aria-sort` sits on the th, as the
 * ARIA table pattern requires; the button inside says the next action.
 */
function SortableHead({
  children,
  direction,
  onSort,
  numeric = false,
  className,
}: {
  children: React.ReactNode;
  direction: SortDirection;
  onSort: () => void;
  numeric?: boolean;
  className?: string;
}) {
  const Icon = direction === "ascending" ? ArrowUp : direction === "descending" ? ArrowDown : ArrowUpDown;
  return (
    <TableHead aria-sort={direction} numeric={numeric} className={className}>
      <button
        type="button"
        onClick={onSort}
        className={cn("-mx-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:text-fg", numeric && "flex-row-reverse", direction !== "none" && "text-fg")}
      >
        {children}
        <Icon className="size-3.5 shrink-0" aria-hidden />
      </button>
    </TableHead>
  );
}

/** "1-10 of 42" with previous / next, for a table paged in memory. `page` is 0-based. */
function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);
  return (
    <div className={cn("flex items-center justify-between gap-3 pt-3 text-caption text-fg-muted", className)}>
      <span className="tabular-nums" aria-live="polite">
        {formatNumber(first, "count")}-{formatNumber(last, "count")} of {formatNumber(total, "count")}
      </span>
      <span className="flex gap-1">
        <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={last >= total} onClick={() => onPageChange(page + 1)}>
          <ChevronRight />
        </Button>
      </span>
    </div>
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption, SortableHead, TablePagination };
