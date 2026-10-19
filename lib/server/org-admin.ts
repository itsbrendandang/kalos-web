import "server-only";

// Read-side queries for the organization admin page. All scoped to an org id
// that came from the resolved SessionContext (member table), never from input.
import { authDb } from "@/lib/server/auth-db";

export interface MemberRow {
  id: string;
  userId: string;
  role: string;
  email: string;
  name: string;
}
export interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}

export function listMembers(orgId: string): MemberRow[] {
  return authDb()
    .prepare("SELECT m.id, m.userId, m.role, u.email, u.name FROM member m JOIN user u ON u.id = m.userId WHERE m.organizationId = ? ORDER BY u.email")
    .all(orgId) as MemberRow[];
}

export function listPendingInvitations(orgId: string, nowMs: number = Date.now()): PendingInvitation[] {
  const rows = authDb()
    .prepare("SELECT id, email, role, expiresAt FROM invitation WHERE organizationId = ? AND status = 'pending' ORDER BY createdAt DESC")
    .all(orgId) as PendingInvitation[];
  return rows.filter((r) => new Date(r.expiresAt).getTime() > nowMs);
}

/** Origin used in invitation links. */
export function publicOrigin(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return (env.KALOS_PUBLIC_URL || env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export const INVITABLE_ROLES = ["viewer", "member", "admin"] as const;
