import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Callout } from "@/components/kit/callout";
import { Button } from "@/components/ui/button";
import { acceptInvitationAction, declineInvitationAction } from "@/lib/server/auth-actions";
import { findUsableInvitation } from "@/lib/server/invitations";
import { resolveSession } from "@/lib/server/session";

export const metadata: Metadata = { title: "Invitation · Kalos" };
export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9_-]{1,128}$/;

export default async function AcceptInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!ID.test(id)) notFound();
  const sp = await searchParams;
  const self = `/accept-invite/${id}`;

  const st = await resolveSession();
  if (st.status === "anonymous") {
    // Nothing about the invitation is shown before sign-in: the link alone
    // does not reveal the organization or the invited address.
    return (
      <AuthCard
        title="You have been invited to Kalos"
        description="Sign in with the Google account this invitation was sent to. You will then set up an authenticator app and join the organization."
      >
        <GoogleSignInButton callbackURL={self} label="Continue with Google" />
      </AuthCard>
    );
  }
  if (st.status === "mfa_required") redirect(`/settings/security?next=${encodeURIComponent(self)}`);

  const inv = findUsableInvitation(id, st.email);

  if (!inv) {
    return (
      <AuthCard
        title="This invitation cannot be used"
        description="It may have expired, already been used or cancelled, or it was sent to a different email address than the Google account you are signed in with."
      >
        <SignOutButton />
      </AuthCard>
    );
  }

  return (
    <AuthCard title={`Join ${inv.organizationName}`} description={`You were invited as ${inv.role}. Signed in as ${st.email}.`}>
      {sp.error ? (
        <Callout tone="bad" title="Could not accept the invitation">
          Try again. If it keeps failing, ask your admin for a new link.
        </Callout>
      ) : null}
      <form action={acceptInvitationAction}>
        <input type="hidden" name="invitationId" value={inv.id} />
        <Button type="submit" className="w-full">
          Accept invitation
        </Button>
      </form>
      <form action={declineInvitationAction}>
        <input type="hidden" name="invitationId" value={inv.id} />
        <Button type="submit" variant="ghost" className="w-full">
          Decline
        </Button>
      </form>
    </AuthCard>
  );
}
