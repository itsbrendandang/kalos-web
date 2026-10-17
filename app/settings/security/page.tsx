import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { BackupCodes, MfaEnrol, MfaVerify } from "@/components/auth/mfa-panel";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Callout } from "@/components/kit/callout";
import { PageHeader } from "@/components/kit/page-header";
import { Section } from "@/components/kit/section";
import { Button } from "@/components/ui/button";
import { safeNextPath } from "@/lib/auth-routes";
import { getAuth } from "@/lib/server/auth";
import { revokeOtherSessionsAction, revokeSessionAction } from "@/lib/server/auth-actions";
import { resolveSession } from "@/lib/server/session";

export const metadata: Metadata = { title: "Security · Kalos" };
export const dynamic = "force-dynamic";

interface SessionRow {
  id: string;
  createdAt: string | Date;
  expiresAt: string | Date;
  userAgent?: string | null;
  ipAddress?: string | null;
  mfaVerifiedAt?: string | Date | null;
}

function fmt(d: string | Date): string {
  return new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

function device(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export default async function SecurityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : undefined);
  const st = await resolveSession();
  if (st.status === "anonymous") redirect(`/sign-in?next=${encodeURIComponent("/settings/security")}`);

  if (st.status === "mfa_required") {
    return st.enrolled ? (
      <AuthCard title="Enter your code" description={`Signed in with Google as ${st.email ?? "you"}. Kalos also needs a code from your authenticator app.`}>
        <MfaVerify next={next} />
        <SignOutButton variant="ghost" />
      </AuthCard>
    ) : (
      <AuthCard title="Set up two-step sign-in" description={`Signed in with Google as ${st.email ?? "you"}. One more step before you can use Kalos.`}>
        <MfaEnrol next={next} />
        <SignOutButton variant="ghost" />
      </AuthCard>
    );
  }

  const sessions = ((await getAuth().api.listSessions({ headers: new Headers(await headers()) })) as SessionRow[]).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const current = st.context.sessionId;

  return (
    <div className={st.status === "ok" ? "flex max-w-2xl flex-col gap-10" : "mx-auto flex max-w-2xl flex-col gap-10 px-6 py-10"}>
      <PageHeader title="Security" description={`Signed in with Google as ${st.email ?? "you"}.`} />
      {sp.revoked ? <Callout tone="good" title={sp.revoked === "others" ? "Signed out of all other sessions." : "Session signed out."} /> : null}

      <Section title="Two-step sign-in" description="An authenticator app code is required after every Google sign-in.">
        <p className="text-body text-fg">On: authenticator app (TOTP).</p>
        <BackupCodes />
      </Section>

      <Section
        title="Active sessions"
        description="Each sign-in lasts at most 7 days. Sign out any session you do not recognise."
        actions={
          sessions.length > 1 ? (
            <form action={revokeOtherSessionsAction}>
              <Button type="submit" variant="outline" size="sm">
                Sign out other sessions
              </Button>
            </form>
          ) : null
        }
      >
        <ul className="divide-y divide-border border-y border-border">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-body text-fg">
                  {device(s.userAgent)}
                  {s.id === current ? <span className="ml-2 text-caption text-accent">This device</span> : null}
                </p>
                <p className="text-caption text-fg-muted">
                  Signed in {fmt(s.createdAt)} · expires {fmt(s.expiresAt)}
                  {s.ipAddress ? ` · ${s.ipAddress}` : ""}
                  {s.mfaVerifiedAt ? "" : " · second step not completed"}
                </p>
              </div>
              <form action={revokeSessionAction}>
                <input type="hidden" name="sessionId" value={s.id} />
                <Button type="submit" variant={s.id === current ? "outline" : "destructive"} size="sm">
                  {s.id === current ? "Sign out" : "Revoke"}
                </Button>
              </form>
            </li>
          ))}
        </ul>
      </Section>

      <div className="max-w-xs">
        <SignOutButton />
      </div>
    </div>
  );
}
