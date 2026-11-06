import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Callout } from "@/components/kit/callout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { safeNextPath } from "@/lib/auth-routes";
import { selectOrgAction } from "@/lib/server/auth-actions";
import { listMyMemberships, requirePageSession } from "@/lib/server/session";

export const metadata: Metadata = { title: "Choose organization · Kalos" };
export const dynamic = "force-dynamic";

export default async function SelectOrgPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : undefined);
  const st = await requirePageSession({ needOrg: false, next: "/select-org" });
  // Only the caller's own memberships, straight from the member table.
  const memberships = await listMyMemberships(st.context.userId);

  if (memberships.length === 0) {
    return (
      <AuthCard title="No organization yet" description="Your account is not a member of any organization. Ask an organization admin for an invitation link.">
        <SignOutButton />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose an organization" description="Kalos shows one organization's campaigns at a time.">
      {sp.error ? <Callout tone="bad" title="You are not a member of that organization." /> : null}
      {/* Choosing an organization is a POST (server action), so each row is a form whose one button is styled as a plain list row. */}
      <ul className="divide-y divide-border border-y border-border">
        {memberships.map((m) => {
          const current = st.status === "ok" && st.context.orgId === m.organizationId;
          return (
            <li key={m.organizationId}>
              <form action={selectOrgAction}>
                <input type="hidden" name="organizationId" value={m.organizationId} />
                <input type="hidden" name="next" value={next} />
                <Button type="submit" variant="ghost" className="-mx-2 h-auto w-[calc(100%+1rem)] justify-between px-2 py-3 font-normal">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-body text-fg">{m.organizationName ?? m.organizationId}</span>
                    {current ? <Badge tone="accent">Current</Badge> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-caption text-fg-muted">
                    {m.role}
                    <ChevronRight className="size-4" aria-hidden />
                  </span>
                </Button>
              </form>
            </li>
          );
        })}
      </ul>
      <SignOutButton variant="ghost" />
    </AuthCard>
  );
}
