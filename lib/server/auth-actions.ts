"use server";

// Server actions for the auth pages. Each one re-resolves the session
// server-side (lib/server/session.ts) - nothing here trusts the caller.
// Next's server actions reject cross-origin POSTs (Origin check).
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth-routes";
import { getAuth } from "@/lib/server/auth";
import { authDb } from "@/lib/server/auth-db";
import { resolveSession } from "@/lib/server/session";
import { ORG_ID_PATTERN } from "@/lib/server/tenants";

const ID = /^[A-Za-z0-9_-]{1,128}$/;

async function reqHeaders(): Promise<Headers> {
  return new Headers(await headers());
}

export async function signOutAction(): Promise<void> {
  const h = await reqHeaders();
  try {
    await getAuth().api.signOut({ headers: h });
  } catch {
    // already signed out / expired: fall through to the signed-out page
  }
  redirect("/signed-out");
}

export async function selectOrgAction(formData: FormData): Promise<void> {
  const orgId = String(formData.get("organizationId") ?? "");
  const next = safeNextPath(formData.get("next"));
  const st = await resolveSession();
  if (st.status !== "ok" && st.status !== "no_org") redirect("/sign-in");
  if (!ORG_ID_PATTERN.test(orgId)) redirect("/select-org");
  // Membership from the member table, not from the client.
  const row = authDb().prepare("SELECT 1 FROM member WHERE userId = ? AND organizationId = ?").get(st.context.userId, orgId);
  if (!row) redirect("/select-org?error=not_a_member");
  await getAuth().api.setActiveOrganization({ headers: await reqHeaders(), body: { organizationId: orgId } });
  redirect(next);
}

export async function acceptInvitationAction(formData: FormData): Promise<void> {
  const id = String(formData.get("invitationId") ?? "");
  if (!ID.test(id)) redirect("/select-org");
  const st = await resolveSession();
  if (st.status === "anonymous") redirect(`/sign-in?next=${encodeURIComponent(`/accept-invite/${id}`)}`);
  if (st.status === "mfa_required") redirect(`/settings/security?next=${encodeURIComponent(`/accept-invite/${id}`)}`);
  let ok = false;
  try {
    // Better Auth re-checks: pending, unexpired, invitation email == session
    // user email, user email verified (requireEmailVerificationOnInvitation).
    await getAuth().api.acceptInvitation({ headers: await reqHeaders(), body: { invitationId: id } });
    ok = true;
  } catch {
    ok = false;
  }
  redirect(ok ? "/" : `/accept-invite/${id}?error=accept_failed`);
}

export async function declineInvitationAction(formData: FormData): Promise<void> {
  const id = String(formData.get("invitationId") ?? "");
  if (!ID.test(id)) redirect("/select-org");
  const st = await resolveSession();
  if (st.status !== "ok" && st.status !== "no_org") redirect("/sign-in");
  try {
    await getAuth().api.rejectInvitation({ headers: await reqHeaders(), body: { invitationId: id } });
  } catch {
    // not ours / already handled
  }
  redirect("/select-org");
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const sessionId = String(formData.get("sessionId") ?? "");
  const st = await resolveSession();
  if (st.status !== "ok" && st.status !== "no_org") redirect("/sign-in");
  if (!ID.test(sessionId)) redirect("/settings/security");
  const h = await reqHeaders();
  // Tokens never leave the server: look the session up among the caller's own.
  const mine = (await getAuth().api.listSessions({ headers: h })) as Array<{ id: string; token: string }>;
  const target = mine.find((s) => s.id === sessionId);
  if (target) await getAuth().api.revokeSession({ headers: h, body: { token: target.token } });
  redirect(sessionId === st.context.sessionId ? "/signed-out" : "/settings/security?revoked=1");
}

export async function revokeOtherSessionsAction(): Promise<void> {
  const st = await resolveSession();
  if (st.status !== "ok" && st.status !== "no_org") redirect("/sign-in");
  await getAuth().api.revokeOtherSessions({ headers: await reqHeaders() });
  redirect("/settings/security?revoked=others");
}

// --- Organization admin (owner/admin only; org from the member table) -------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireOrgAdmin() {
  const st = await resolveSession();
  if (st.status !== "ok") redirect("/sign-in");
  if (!st.context.permissions?.includes("org:admin")) redirect("/settings/organization?error=forbidden");
  return st;
}

export async function inviteMemberAction(formData: FormData): Promise<void> {
  const st = await requireOrgAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");
  const allowed = st.context.roles?.includes("owner") ? ["viewer", "member", "admin", "owner"] : ["viewer", "member", "admin"];
  if (!EMAIL.test(email) || email.length > 254 || !allowed.includes(role)) redirect("/settings/organization?error=invalid");
  let id: string | null = null;
  try {
    const inv = (await getAuth().api.createInvitation({
      headers: await reqHeaders(),
      body: { email, role: role as "viewer" | "member" | "admin" | "owner", organizationId: st.context.orgId },
    })) as { id?: string };
    id = inv?.id ?? null;
  } catch {
    id = null;
  }
  redirect(id ? `/settings/organization?invited=${encodeURIComponent(id)}` : "/settings/organization?error=invite_failed");
}

export async function cancelInvitationAction(formData: FormData): Promise<void> {
  await requireOrgAdmin();
  const id = String(formData.get("invitationId") ?? "");
  if (ID.test(id)) {
    try {
      await getAuth().api.cancelInvitation({ headers: await reqHeaders(), body: { invitationId: id } });
    } catch {
      // Better Auth checks the invitation belongs to an org the caller administers
    }
  }
  redirect("/settings/organization");
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const st = await requireOrgAdmin();
  const memberId = String(formData.get("memberId") ?? "");
  if (ID.test(memberId)) {
    try {
      await getAuth().api.removeMember({ headers: await reqHeaders(), body: { memberIdOrEmail: memberId, organizationId: st.context.orgId } });
    } catch {
      redirect("/settings/organization?error=remove_failed");
    }
  }
  redirect("/settings/organization");
}
