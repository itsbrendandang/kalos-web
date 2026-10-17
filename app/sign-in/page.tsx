import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { Callout } from "@/components/kit/callout";
import { safeNextPath } from "@/lib/auth-routes";
import { resolveSession } from "@/lib/server/session";

export const metadata: Metadata = { title: "Sign in · Kalos" };

// Error codes Better Auth appends as ?error= (validateUserInfo, OAuth). Only
// these known codes are shown; anything else gets the generic message.
const ERRORS: Record<string, string> = {
  not_invited: "This Google account has no invitation. Kalos is invite-only: ask your organization admin for an invitation link, then sign in with the invited email.",
  email_not_verified: "Google has not verified this email address, so it cannot be used to sign in.",
  account_not_linked: "This email already belongs to a Kalos account that cannot be linked to this Google sign-in. Contact your admin.",
  method_not_allowed: "Only Google sign-in is available.",
  signup_disabled: "New accounts can only be created from an invitation link.",
  state_mismatch: "The sign-in took too long or was opened in another browser. Try again.",
  please_restart_the_process: "The sign-in took too long or was opened in another browser. Try again.",
  access_denied: "Google sign-in was cancelled.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : undefined);
  const code = typeof sp.error === "string" ? sp.error.toLowerCase() : null;

  const st = await resolveSession();
  if (st.status === "ok" || st.status === "no_org") redirect(next);
  if (st.status === "mfa_required") redirect(`/settings/security?next=${encodeURIComponent(next)}`);

  return (
    <AuthCard
      title="Sign in to Kalos"
      description="Kalos is in an invite-only beta. Sign in with the Google account your invitation was sent to."
    >
      {code ? (
        <Callout tone="bad" title="Sign-in did not complete">
          {ERRORS[code] ?? "Something went wrong during sign-in. Try again, or contact your admin if it keeps happening."}
        </Callout>
      ) : null}
      <GoogleSignInButton callbackURL={next} />
      <p className="text-caption text-fg-muted">
        No invitation yet? Ask an admin of your organization to invite you. After Google, you will set up (or enter) a
        code from an authenticator app.
      </p>
    </AuthCard>
  );
}
