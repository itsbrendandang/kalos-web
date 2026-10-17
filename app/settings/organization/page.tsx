import type { Metadata } from "next";
import { Callout } from "@/components/kit/callout";
import { PageHeader } from "@/components/kit/page-header";
import { Section } from "@/components/kit/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancelInvitationAction, inviteMemberAction, removeMemberAction } from "@/lib/server/auth-actions";
import { listMembers, listPendingInvitations, publicOrigin } from "@/lib/server/org-admin";
import { requirePageSession } from "@/lib/server/session";

export const metadata: Metadata = { title: "Members · Kalos" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  forbidden: "Only organization owners and admins can manage members.",
  invalid: "Enter a valid email address and pick a role.",
  invite_failed: "Could not create the invitation. The person may already be a member.",
  remove_failed: "Could not remove that member (an organization needs at least one owner).",
};

export default async function OrganizationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const st = await requirePageSession({ needOrg: true, next: "/settings/organization" });
  if (st.status !== "ok") return null;
  const isAdmin = !!st.context.permissions?.includes("org:admin");
  const isOwner = !!st.context.roles?.includes("owner");
  const members = listMembers(st.context.orgId);
  const pending = isAdmin ? listPendingInvitations(st.context.orgId) : [];
  const origin = publicOrigin();
  const err = typeof sp.error === "string" ? ERRORS[sp.error] : undefined;
  const invited = typeof sp.invited === "string" ? pending.find((p) => p.id === sp.invited) : undefined;

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <PageHeader title="Members" description="Kalos is invite-only. Invitations are links you send yourself; no email is sent." />
      {err ? <Callout tone="bad" title={err} /> : null}
      {invited ? (
        <Callout tone="good" title={`Invitation created for ${invited.email}`}>
          Send this link to them. It works once, only for that Google account, until {new Date(invited.expiresAt).toUTCString()}.
          <code className="mt-2 block rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-label break-all select-all">
            {origin}/accept-invite/{invited.id}
          </code>
        </Callout>
      ) : null}

      {isAdmin ? (
        <Section title="Invite someone" description="They sign in with Google using this exact email, then set up an authenticator app.">
          <form action={inviteMemberAction} className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-56 flex-1 gap-1 text-label text-fg">
              Email
              <Input name="email" type="email" required autoComplete="off" />
            </label>
            <label className="grid gap-1 text-label text-fg">
              Role
              <select name="role" defaultValue="member" className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-body text-fg">
                <option value="viewer">Viewer (read)</option>
                <option value="member">Member (read and write)</option>
                <option value="admin">Admin (also manages members, archives)</option>
                {isOwner ? <option value="owner">Owner</option> : null}
              </select>
            </label>
            <Button type="submit">Create invitation</Button>
          </form>
        </Section>
      ) : null}

      {isAdmin && pending.length ? (
        <Section title="Pending invitations">
          <ul className="divide-y divide-border border-y border-border">
            {pending.map((p) => (
              <li key={p.id} className="grid gap-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-body text-fg">
                    {p.email} <span className="text-caption text-fg-muted">· {p.role}</span>
                  </p>
                  <form action={cancelInvitationAction}>
                    <input type="hidden" name="invitationId" value={p.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Cancel
                    </Button>
                  </form>
                </div>
                <code className="block rounded-md border border-border bg-subtle px-2 py-1 font-mono text-caption break-all select-all">
                  {origin}/accept-invite/{p.id}
                </code>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Members">
        <ul className="divide-y divide-border border-y border-border">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <p className="min-w-0 text-body text-fg">
                {m.name || m.email} <span className="text-caption text-fg-muted">· {m.email} · {m.role}</span>
              </p>
              {isAdmin && m.userId !== st.context.userId ? (
                <form action={removeMemberAction}>
                  <input type="hidden" name="memberId" value={m.id} />
                  <Button type="submit" variant="destructive" size="sm">
                    Remove
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
