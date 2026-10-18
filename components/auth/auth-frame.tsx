"use client";

import { redirect, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/workbench/app-shell";
import { classifyRoute, isSessionFlowPage } from "@/lib/auth-routes";

export type FrameState = "anonymous" | "mfa_required" | "no_org" | "ok";

/**
 * Chooses the frame for a page from the session state the ROOT LAYOUT
 * resolved server-side (lib/server/session.ts):
 * - public pages (sign-in, signed-out, accept-invite) render bare;
 * - everything else needs a full session: anonymous -> /sign-in,
 *   no second factor -> /settings/security, no organization -> /select-org;
 * - only an "ok" session gets the workbench shell (which loads engine data).
 * The protected page's children are never rendered for a state that may not
 * see them. Route handlers and server components still do their own checks.
 */
export function AuthFrame({ state, children }: { state: FrameState; children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  if (classifyRoute(pathname) === "public") return <>{children}</>;
  const next = `?next=${encodeURIComponent(pathname)}`;
  if (state === "anonymous") redirect(`/sign-in${next}`);
  if (isSessionFlowPage(pathname)) return state === "ok" ? <AppShell>{children}</AppShell> : <>{children}</>;
  if (state === "mfa_required") redirect(`/settings/security${next}`);
  if (state === "no_org") redirect(`/select-org${next}`);
  return <AppShell>{children}</AppShell>;
}
