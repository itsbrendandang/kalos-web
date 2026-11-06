// Who is looking at the app, as the browser may show it. Pure: no server imports, so the
// client and the tests can both use it.
//
// Two real cases: local mode (the desktop app on one machine, no sign-in at all) and a
// signed-in session (the name and email come from the server-side session, never from the
// client). A `unknown` viewer is only the default before the provider mounts.

export type Viewer =
  | { kind: "local" }
  | { kind: "signed-in"; name: string | null; email: string | null }
  | { kind: "unknown" };

/** The part of a session state the viewer needs (lib/server/session.ts SessionState). */
export type SessionView = { status: "anonymous" | "mfa_required" | "no_org" | "ok"; name?: string | null; email?: string | null };

export const LOCAL_LABEL = "Local mode, no sign-in";

/** A session state to a viewer. Anything that is not a session (anonymous) is unknown, never a guessed name. */
export function viewerFrom(st: SessionView): Viewer {
  if (st.status === "anonymous") return { kind: "unknown" };
  return { kind: "signed-in", name: st.name ?? null, email: st.email ?? null };
}

/** The name to record against a change: the profile name, else the email, else a plain fallback. */
export function viewerLabel(v: Viewer): string {
  if (v.kind === "local") return LOCAL_LABEL;
  if (v.kind === "signed-in") return v.name ?? v.email ?? "Signed-in user";
  return "Unknown user";
}

/** One sentence for the approve step: who is approving, or why no name can be shown. */
export function approverSentence(v: Viewer): string {
  if (v.kind === "local") return "Local mode, no sign-in: no user name is recorded for this approval.";
  if (v.kind === "signed-in") {
    const who = v.name ?? v.email;
    return who ? `You are approving as ${who}.` : "You are approving with this account. No name is set in your profile.";
  }
  return "The approver's name is not available in this view.";
}
