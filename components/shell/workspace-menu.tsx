"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Ellipsis, LogOut, Settings, ShieldCheck, Users } from "lucide-react";
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


/**
 * The workspace menu: Theme, Settings, Security (two-step sign-in, sessions),
 * Members (invitations) and Sign out (a POST server action, never a GET link).
 */
export function WorkspaceMenu({ side = "right", className }: { side?: "right" | "bottom"; className?: string }) {
  const router = useRouter();
  const theme = useThemePreference();
  const [signingOut, startSignOut] = useTransition();
  return (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Workspace menu"
          className={cn("grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-subtle hover:text-fg data-popup-open:bg-selected data-popup-open:text-fg", className)}
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
          <DropdownMenuItem onClick={() => router.push("/settings/organization")}>
            <Users aria-hidden />
            Members
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={signingOut} onClick={() => startSignOut(() => signOutAction())}>
            <LogOut aria-hidden />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
  );
}
