"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { Dialog } from "@base-ui/react/dialog";
import { CornerDownLeft, Search } from "lucide-react";
import { toggleTheme } from "@/hooks/use-theme";
import { CAMPAIGN_STAGES, LIBRARY_ITEMS, NAV_ITEMS, OVERVIEW_ROUTE } from "@/lib/routes";

type Command = { value: string; label: string; hint: string; run: () => void };
type CommandGroup = { value: string; items: Command[] };

/**
 * ⌘K / Ctrl+K: jump to any page or stage, or run a few actions. Base UI
 * Autocomplete rendered inline inside a Dialog (the documented command
 * palette pattern): type to filter, arrows to move, Enter to run, Escape to
 * close. Opened by the shell's keyboard shortcut and the search buttons.
 */
export function CommandPalette({
  open,
  onOpenChange,
  onToggleExplorer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleExplorer: () => void;
}) {
  const router = useRouter();
  const hintId = useId();
  const go = (href: string) => () => router.push(href);

  const groups: CommandGroup[] = [
    {
      value: "Campaign",
      items: [OVERVIEW_ROUTE, ...CAMPAIGN_STAGES].map((r) => ({ value: r.href, label: r.label, hint: r.description, run: go(r.href) })),
    },
    {
      value: "Pages",
      items: [
        ...NAV_ITEMS.filter((n) => n.key !== "campaign"),
        ...LIBRARY_ITEMS.filter((l) => l.href.startsWith("/library/")),
      ].map((r) => ({ value: r.href, label: r.label, hint: r.description, run: go(r.href) })),
    },
    {
      value: "Actions",
      items: [
        { value: "action:upload", label: "Upload a run sheet", hint: "Start or replace the campaign's data", run: go("/campaign/setup") },
        { value: "action:record", label: "Record results", hint: "Enter measured values for runs in flight", run: go("/campaign/record") },
        { value: "action:theme", label: "Toggle theme", hint: "Switch between light and dark", run: toggleTheme },
        { value: "action:explorer", label: "Toggle explorer", hint: "Show or hide the side tree", run: onToggleExplorer },
      ],
    },
  ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-black/60" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[12vh]">
          <Dialog.Popup
            aria-label="Command palette"
            className="flex max-h-[min(32rem,calc(100dvh-6rem))] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface text-fg shadow-popover transition-[opacity,scale] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0"
          >
            <Autocomplete.Root open inline items={groups} autoHighlight="always" keepHighlight>
              <div className="flex items-center gap-2 border-b border-border px-3">
                <Search className="size-4 shrink-0 text-fg-muted" aria-hidden />
                <Autocomplete.Input
                  aria-label="Search pages and actions"
                  aria-describedby={hintId}
                  placeholder="Search pages and actions"
                  className="h-11 w-full bg-transparent text-body text-fg outline-none placeholder:text-fg-muted"
                />
              </div>
              <Dialog.Close className="sr-only">Close command palette</Dialog.Close>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
                <Autocomplete.Empty>
                  <p className="px-3 py-6 text-center text-body text-fg-muted">No page or action matches.</p>
                </Autocomplete.Empty>
                <Autocomplete.List>
                  {(group: CommandGroup) => (
                    <Autocomplete.Group key={group.value} items={group.items} className="mb-1 last:mb-0">
                      <Autocomplete.GroupLabel className="px-2.5 pt-2 pb-1 text-caption font-medium text-fg-muted">
                        {group.value}
                      </Autocomplete.GroupLabel>
                      <Autocomplete.Collection>
                        {(item: Command) => (
                          <Autocomplete.Item
                            key={item.value}
                            value={item}
                            onClick={() => {
                              onOpenChange(false);
                              item.run();
                            }}
                            className="group flex min-h-9 cursor-default items-center gap-3 rounded-md px-2.5 py-1.5 select-none data-highlighted:bg-subtle"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-body text-fg">{item.label}</span>
                              <span className="block truncate text-caption text-fg-muted">{item.hint}</span>
                            </span>
                            <CornerDownLeft className="invisible size-3.5 shrink-0 text-fg-muted group-data-highlighted:visible" aria-hidden />
                          </Autocomplete.Item>
                        )}
                      </Autocomplete.Collection>
                    </Autocomplete.Group>
                  )}
                </Autocomplete.List>
              </div>
              <div id={hintId} className="flex items-center gap-3 border-t border-border px-3 py-2 text-caption text-fg-muted">
                <span>Arrow keys to move</span>
                <span>Enter to open</span>
                <span>Esc to close</span>
              </div>
            </Autocomplete.Root>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
