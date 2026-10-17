import "server-only";

// Better Auth session -> provider-neutral SessionContext
// (lib/server/session-context.ts, docs/AUTH_PROVIDER_INTERFACE.md).
//
// This is THE server-side authorization check. proxy.ts only does an
// optimistic cookie-presence redirect; every route handler, server component
// and server action that touches user data must call one of
// requireApiSession / requirePageSession / resolveSession itself.
//
// Rules:
// - The session comes from Better Auth's database lookup of the HttpOnly
//   session cookie (no cookie cache), never from headers/body/query.
// - MFA: a session without mfaVerifiedAt is not a usable session
//   (status "mfa_required"); it can only enrol/verify on /settings/security.
// - Authorization ALWAYS comes from the `member` table. The session's
//   activeOrganizationId is only a *selection hint*: it is re-checked against
//   member(userId, organizationId) on every call and the role is read from
//   that row, so removing a member or changing a role takes effect on the
//   next request even though the session row still carries the old hint.
import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import {
  mfaSatisfied,
  mfaVerifiedAtSeconds,
  parseRoles,
  permissionsForRole,
  UNVERIFIED_SESSION_TTL_SECONDS,
  type BetterAuthSessionLike,
} from "@/lib/server/auth-config.mjs";
import type { SessionContext } from "@/lib/server/session-context";
import { ORG_ID_PATTERN } from "@/lib/server/tenants";

export interface Membership {
  organizationId: string;
  role: string;
  organizationName?: string;
  organizationSlug?: string;
}

/** What the resolver needs from the auth provider. Tests inject a fake. */
export interface AuthBackend {
  getSession(headers: Headers): Promise<BetterAuthSessionLike | null>;
  findMembership(userId: string, organizationId: string): Promise<Membership | null>;
  listMemberships(userId: string): Promise<Membership[]>;
}

export type SessionState =
  | { status: "anonymous" }
  | { status: "mfa_required"; userId: string; sessionId: string; email: string | null; enrolled: boolean }
  | { status: "no_org"; context: SessionContext; email: string | null; membershipCount: number }
  | { status: "ok"; context: SessionContext & { orgId: string }; email: string | null };

/** Build the neutral context from a verified session and a member row. Pure. */
export function sessionContextFrom(session: BetterAuthSessionLike, membership: Membership | null): SessionContext {
  const roles = membership ? parseRoles(membership.role) : [];
  return {
    userId: session.user.id,
    sessionId: session.session.id,
    orgId: membership ? membership.organizationId : null,
    role: roles[0] ?? null,
    roles,
    permissions: membership ? permissionsForRole(membership.role) : [],
    authenticatedAt: mfaVerifiedAtSeconds(session),
    mfaVerified: mfaSatisfied(session),
  };
}

export function createSessionResolver(backend: AuthBackend, now: () => number = Date.now) {
  return async function resolve(headers: Headers): Promise<SessionState> {
    let s: BetterAuthSessionLike | null;
    try {
      s = await backend.getSession(headers);
    } catch {
      return { status: "anonymous" };
    }
    if (!s?.session?.id || !s.user?.id) return { status: "anonymous" };

    if (!mfaSatisfied(s)) {
      // The DB expiry already enforces the short TTL; re-checked here so a
      // misconfigured hook can never turn a half session into a long one.
      const created = new Date(s.session.createdAt ?? 0).getTime();
      if (!Number.isFinite(created) || now() - created > UNVERIFIED_SESSION_TTL_SECONDS * 1000) return { status: "anonymous" };
      return {
        status: "mfa_required",
        userId: s.user.id,
        sessionId: s.session.id,
        email: s.user.email ?? null,
        enrolled: s.user.twoFactorEnabled === true,
      };
    }

    let membership: Membership | null = null;
    const hint = s.session.activeOrganizationId;
    if (typeof hint === "string" && ORG_ID_PATTERN.test(hint)) {
      membership = await backend.findMembership(s.user.id, hint);
    }
    let membershipCount = membership ? 1 : 0;
    if (!membership) {
      const all = await backend.listMemberships(s.user.id);
      membershipCount = all.length;
      // A single membership needs no explicit selection.
      if (all.length === 1) membership = all[0];
    }
    if (membership && parseRoles(membership.role).length === 0) membership = null; // unknown role = no access
    const context = sessionContextFrom(s, membership);
    const email = s.user.email ?? null;
    if (!membership || !context.orgId) return { status: "no_org", context, email, membershipCount };
    return { status: "ok", context: { ...context, orgId: context.orgId }, email };
  };
}

// ---------------------------------------------------------------------------
// Default backend: Better Auth + the auth SQLite database
// ---------------------------------------------------------------------------
let defaultResolver: ((h: Headers) => Promise<SessionState>) | null = null;

async function defaultBackend(): Promise<AuthBackend> {
  const [{ getAuth }, { authDb }] = await Promise.all([import("@/lib/server/auth"), import("@/lib/server/auth-db")]);
  const db = authDb();
  const findStmt = () =>
    db.prepare("SELECT organizationId, role FROM member WHERE userId = ? AND organizationId = ? LIMIT 1");
  const listStmt = () =>
    db.prepare(
      "SELECT m.organizationId AS organizationId, m.role AS role, o.name AS organizationName, o.slug AS organizationSlug " +
        "FROM member m JOIN organization o ON o.id = m.organizationId WHERE m.userId = ? ORDER BY o.name",
    );
  return {
    async getSession(h) {
      return (await getAuth().api.getSession({ headers: h })) as BetterAuthSessionLike | null;
    },
    async findMembership(userId, organizationId) {
      return (findStmt().get(userId, organizationId) as Membership | undefined) ?? null;
    },
    async listMemberships(userId) {
      return listStmt().all(userId) as Membership[];
    },
  };
}

/** Resolve the current request's session state (default: next/headers). */
export async function resolveSession(h?: Headers): Promise<SessionState> {
  if (!defaultResolver) defaultResolver = createSessionResolver(await defaultBackend());
  return defaultResolver(h ?? new Headers(await nextHeaders()));
}

/** MFA-verified SessionContext (orgId may be null), or null. */
export async function getSessionContext(h?: Headers): Promise<SessionContext | null> {
  const st = await resolveSession(h);
  if (st.status === "ok" || st.status === "no_org") return st.context;
  return null;
}

/** Memberships of the current MFA-verified user (for /select-org). */
export async function listMyMemberships(userId: string): Promise<Membership[]> {
  return (await defaultBackend()).listMemberships(userId);
}

const NO_STORE = { "cache-control": "no-store" };

/** Map a state to the API answer: 401 / 403 JSON, never a redirect. Pure. */
export function apiDecision(st: SessionState): { ok: true; context: SessionContext & { orgId: string } } | { ok: false; status: 401 | 403; error: string } {
  switch (st.status) {
    case "ok":
      return { ok: true, context: st.context };
    case "anonymous":
      return { ok: false, status: 401, error: "unauthenticated" };
    case "mfa_required":
      return { ok: false, status: 403, error: "mfa_required" };
    case "no_org":
      return { ok: false, status: 403, error: "no_organization" };
  }
}

/** For route handlers under /api/*. */
export async function requireApiSession(
  h?: Headers,
): Promise<{ ok: true; context: SessionContext & { orgId: string } } | { ok: false; response: Response }> {
  const d = apiDecision(await resolveSession(h));
  if (d.ok) return d;
  return { ok: false, response: Response.json({ error: d.error }, { status: d.status, headers: NO_STORE }) };
}

/** Where a page request in a given state must go (null = render). Pure. */
export function pageRedirect(st: SessionState, opts: { needOrg: boolean; next?: string }): string | null {
  const next = opts.next ? `?next=${encodeURIComponent(opts.next)}` : "";
  if (st.status === "anonymous") return `/sign-in${next}`;
  if (st.status === "mfa_required") return `/settings/security${next}`;
  if (st.status === "no_org" && opts.needOrg) return `/select-org${next}`;
  return null;
}

/** For server components / server actions: redirects unless the state allows rendering. */
export async function requirePageSession(opts: { needOrg?: boolean; next?: string } = {}): Promise<SessionState & { status: "ok" | "no_org" }> {
  const st = await resolveSession();
  const to = pageRedirect(st, { needOrg: opts.needOrg ?? true, next: opts.next });
  if (to) redirect(to);
  return st as SessionState & { status: "ok" | "no_org" };
}
