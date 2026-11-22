"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Keyboard, Settings, SlidersHorizontal } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setThemePreference, useThemePreference, type ThemePreference } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

const SHORTCUTS: [keys: string, what: string][] = [
  ["⌘K or Ctrl+K", "Search pages and actions"],
  ["Up / Down", "Move through the sidebar tree"],
  ["Left / Right", "Close or open a tree group"],
  ["Enter", "Open the focused page or run the highlighted action"],
  ["Esc", "Close the palette, menus and dialogs"],
];

/**
 * The Settings menu in the top bar. Kalos has no accounts, so it shows no
 * identity: only Theme, the Settings page and Keyboard shortcuts. The label
 * hides on narrow screens; the trigger keeps its accessible name.
 */
export function WorkspaceMenu({ className }: { className?: string }) {
  const router = useRouter();
  const theme = useThemePreference();
  const [shortcuts, setShortcuts] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Settings menu"
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-body text-fg-muted hover:text-fg data-popup-open:bg-subtle data-popup-open:text-fg",
            className,
          )}
        >
          <Settings className="size-4" aria-hidden />
          <span className="max-sm:hidden">Settings</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" sideOffset={8}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={(v: ThemePreference) => setThemePreference(v)}>
              <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">Match the system</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/settings")}>
            <SlidersHorizontal aria-hidden />
            All settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShortcuts(true)}>
            <Keyboard aria-hidden />
            Keyboard shortcuts
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={shortcuts} onOpenChange={setShortcuts}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>Everything in Kalos also works with a mouse or touch.</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body">
            {SHORTCUTS.map(([keys, what]) => (
              <div key={keys} className="contents">
                <dt>
                  <kbd className="rounded-md border border-border bg-subtle px-1.5 py-0.5 text-caption text-fg">{keys}</kbd>
                </dt>
                <dd className="text-fg-muted">{what}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}
