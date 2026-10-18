import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Callout } from "@/components/kit/callout";
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
      <AuthCard
        title="No organization yet"
        description="Your account is not a member of any organization. Ask an organization admin for an invitation link."
      >
        <SignOutButton />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose an organization" description="Kalos shows one organization's campaigns at a time.">
      {sp.error ? <Callout tone="bad" title="You are not a member of that organization." /> : null}
      <ul className="grid gap-2">
        {memberships.map((m) => (
          <li key={m.organizationId}>
            <form action={selectOrgAction}>
              <input type="hidden" name="organizationId" value={m.organizationId} />
              <input type="hidden" name="next" value={next} />
              <Button
                type="submit"
                variant={st.status === "ok" && st.context.orgId === m.organizationId ? "secondary" : "outline"}
                className="h-auto w-full justify-between py-2.5"
              >
                <span className="truncate">{m.organizationName ?? m.organizationId}</span>
                <span className="text-caption text-fg-muted">{m.role}</span>
              </Button>
            </form>
          </li>
        ))}
      </ul>
      <SignOutButton variant="ghost" />
    </AuthCard>
  );
}
