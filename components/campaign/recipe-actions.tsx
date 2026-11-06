"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Copy and Print for a table of recipes, on Plan and Run. Copy puts the same table on the clipboard as
 * tab-separated text (one recipe per row, the inputs in the page's column order, exact values), so it
 * pastes into a spreadsheet or a lab notebook. Print prints the page (the sidebar and buttons stay out
 * of the print, see app/globals.css).
 */
export function RecipeActions({ text, what = "recipes" }: { text: string; what?: string }) {
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(t);
  }, [copied]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Button variant="outline" size="sm" onClick={() => void copy()} aria-label={`Copy the ${what} as a table`}>
        {copied === "done" ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied === "done" ? "Copied" : `Copy ${what}`}
      </Button>
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer aria-hidden />
        Print
      </Button>
      <span role="status" className="text-caption text-fg-muted">
        {copied === "done" ? "On the clipboard as a table; paste it into a spreadsheet." : copied === "failed" ? "The browser did not allow copying. Select the table and copy it instead." : null}
      </span>
    </div>
  );
}
