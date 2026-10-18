import "server-only";

// Read-only invitation lookups for the /accept-invite page. Acceptance itself
// goes through Better Auth (auth.api.acceptInvitation), which re-checks
// everything below plus the user's verified email.
import { authDb } from "@/lib/server/auth-db";

export interface InvitationView {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string | number;
  organizationName: string;
}

/** Pure: may this signed-in email use this invitation right now? */
export function invitationUsableBy(inv: InvitationView | null | undefined, email: string | null, nowMs: number): inv is InvitationView {
  if (!inv || !email) return false;
  if (inv.status !== "pending") return false;
  const exp = new Date(typeof inv.expiresAt === "number" ? inv.expiresAt : String(inv.expiresAt)).getTime();
  if (!Number.isFinite(exp) || exp <= nowMs) return false;
  return inv.email.toLowerCase() === email.toLowerCase();
}

/** The invitation if (and only if) `email` may accept it now; otherwise null. */
export function findUsableInvitation(id: string, email: string | null): InvitationView | null {
  const inv = authDb()
    .prepare(
      "SELECT i.id, i.email, i.role, i.status, i.expiresAt, o.name AS organizationName FROM invitation i JOIN organization o ON o.id = i.organizationId WHERE i.id = ?",
    )
    .get(id) as InvitationView | undefined;
  return invitationUsableBy(inv, email, Date.now()) ? inv : null;
}
