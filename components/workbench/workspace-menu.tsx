"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ellipsis, Keyboard, LogOut, Settings, ShieldCheck } from "lucide-react";
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
import { signOutAction } from "@/lib/server/auth-actions";
import { cn } from "@/lib/utils";

const SHORTCUTS: [keys: string, what: string][] = [
  ["⌘K or Ctrl+K", "Search pages and actions"],
  ["Up / Down", "Move through the explorer tree"],
  ["Left / Right", "Close or open a tree group"],
  ["Enter", "Open the focused page or run the highlighted action"],
  ["Left / Right on a tab", "Switch between open pages"],
  ["Delete on a tab", "Close that page's tab"],
  ["Esc", "Close the palette, menus and dialogs"],
];

/**
 * The workspace menu: Theme, Settings, Security (two-step sign-in, sessions),
 * Keyboard shortcuts and Sign out (a POST server action, never a GET link).
 */
export function WorkspaceMenu({ side = "right", className }: { side?: "right" | "bottom"; className?: string }) {
  const router = useRouter();
  const theme = useThemePreference();
  const [shortcuts, setShortcuts] = useState(false);
  const [signingOut, startSignOut] = useTransition();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Workspace menu"
          className={cn("grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface hover:text-fg data-popup-open:bg-surface data-popup-open:text-fg", className)}
        >
          <Ellipsis className="size-5" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent side={side} align="end" sideOffset={8}>
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
            <Settings aria-hidden />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/settings/security")}>
            <ShieldCheck aria-hidden />
            Security
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShortcuts(true)}>
            <Keyboard aria-hidden />
            Keyboard shortcuts
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={signingOut} onClick={() => startSignOut(() => signOutAction())}>
            <LogOut aria-hidden />
            Sign out
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
