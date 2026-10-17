// Which file the analysis on the Setup page belongs to, and what a FAILED upload does to it.
//
// The engine keeps its last good analysis when an upload is rejected, so /api/latest still returns the
// PREVIOUS file's fit underneath the error. This reducer makes that explicit instead of letting the page
// treat it as the new file's analysis:
//   - `file`    the file the shown analysis was fitted from (null after a page reload: nothing to re-fit)
//   - `failed`  the most recent attempt that was rejected; while set, the shown analysis is STALE
//   - `confirmed` the user pressed "Looks right" for the CURRENT analysis; it never survives an attempt,
//                 a failure, or a different file.
// While stale, nothing that acts on the analysis (confirm, re-fit, target change, the next-step action)
// is offered, unless the user explicitly chooses to keep working with the previous file.

export type FailedAttempt = {
  file: File;
  name: string;
  error: string;
  /** True when the rejected request was a re-fit of the held file rather than a different upload. */
  refit: boolean;
};

export type SetupState = {
  file: File | null;
  failed: FailedAttempt | null;
  confirmed: boolean;
};

export const initialSetupState: SetupState = { file: null, failed: null, confirmed: false };

export type SetupAction =
  | { type: "start" }
  | { type: "success"; file: File }
  | { type: "failure"; file: File; error: string }
  | { type: "confirm" }
  | { type: "keepPrevious" };

export function setupReducer(s: SetupState, a: SetupAction): SetupState {
  switch (a.type) {
    case "start":
      // A new attempt invalidates any earlier confirmation or failure note straight away.
      return { ...s, failed: null, confirmed: false };
    case "success":
      return { file: a.file, failed: null, confirmed: false };
    case "failure":
      // The held file stays the previous successful one; it is only identified as such, never as the new file.
      return { ...s, failed: { file: a.file, name: a.file.name, error: a.error, refit: a.file === s.file }, confirmed: false };
    case "confirm":
      return s.failed ? s : { ...s, confirmed: true };
    case "keepPrevious":
      return { ...s, failed: null, confirmed: false };
  }
}

/** The shown analysis comes from an earlier file than the last attempt. */
export const isStale = (s: SetupState): boolean => s.failed !== null;

/**
 * Banner naming the previous analysis, or null when nothing is stale. `previousName` is the dataset the engine
 * still holds (from /api/latest), which is correct even after a reload when no File is held.
 */
export function staleNotice(s: SetupState, previousName: string | null | undefined): string | null {
  if (!s.failed) return null;
  const prev = previousName?.trim() || "the previous file";
  return s.failed.refit
    ? `Showing the last successful analysis: ${prev}. This re-fit was not applied.`
    : `Showing the last successful analysis: ${prev}. Your new file ${s.failed.name} was not used.`;
}

/** Confirm / re-fit / target change act on the analysis; they are only offered when it is not stale and a file is held. */
export const canActOnAnalysis = (s: SetupState): boolean => s.file !== null && s.failed === null;

/**
 * FIX 8 decision: confirmation is ADVISORY. The engine has already saved the fit and a reload skips the step, so
 * routes are not hard-blocked (the sidebar and status bar link straight on). The header's next-step action is
 * therefore always offered for a current analysis, but styled as primary only once the columns were confirmed
 * (or there is nothing to confirm); until then it is secondary and says so. A stale analysis offers no next step.
 */
export type NextAction = { visible: boolean; emphasis: "primary" | "secondary"; hint: string | null };

export function nextAction(s: SetupState, opts: { hasAnalysis: boolean; validationFailed: boolean }): NextAction {
  if (!opts.hasAnalysis || opts.validationFailed || isStale(s)) return { visible: false, emphasis: "primary", hint: null };
  const unconfirmed = s.file !== null && !s.confirmed;
  return { visible: true, emphasis: unconfirmed ? "secondary" : "primary", hint: unconfirmed ? "Columns not confirmed yet (optional)" : null };
}
