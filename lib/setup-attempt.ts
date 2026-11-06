// Which file the analysis on the Setup page belongs to, and what a FAILED upload does to it.
//
// The engine keeps its last good analysis when an upload is rejected, so /api/latest still returns the
// PREVIOUS file's fit underneath the error. This reducer makes that explicit instead of letting the page
// treat it as the new file's analysis:
//   - `file`    the file the shown analysis was fitted from (null after a page reload: nothing to re-fit)
//   - `failed`  the most recent attempt that was rejected; while set, the shown analysis is STALE
// The columns are chosen BEFORE the fit (lib/column-choice.ts), so there is no confirmation step after it.
// While stale, nothing that acts on the analysis (re-fit, the next-step action) is offered, unless the user
// explicitly chooses to keep working with the previous file.

export type FailedAttempt = {
  file: File;
  name: string;
  error: string;
  /** True when the rejected request was a re-fit of the held file rather than a different upload. */
  refit: boolean;
  /** Worksheets of the rejected workbook when the engine listed them (more than one), else empty. */
  sheets: string[];
};

export type SetupState = {
  file: File | null;
  failed: FailedAttempt | null;
  /** Worksheets of the held workbook when the engine listed more than one, and the one it read. */
  sheets: string[];
  sheetUsed: string | null;
};

export const initialSetupState: SetupState = { file: null, failed: null, sheets: [], sheetUsed: null };

export type SetupAction =
  | { type: "start" }
  | { type: "success"; file: File; sheets?: string[]; sheetUsed?: string | null }
  | { type: "failure"; file: File; error: string; sheets?: string[] }
  | { type: "keepPrevious" };

export function setupReducer(s: SetupState, a: SetupAction): SetupState {
  switch (a.type) {
    case "start":
      // A new attempt invalidates any earlier failure note straight away.
      return { ...s, failed: null };
    case "success":
      return { file: a.file, failed: null, sheets: a.sheets ?? [], sheetUsed: a.sheetUsed ?? null };
    case "failure":
      // The held file stays the previous successful one; it is only identified as such, never as the new file.
      return { ...s, failed: { file: a.file, name: a.file.name, error: a.error, refit: a.file === s.file, sheets: a.sheets ?? [] } };
    case "keepPrevious":
      return { ...s, failed: null };
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
  const prev = previousName?.trim() || "the previous sheet";
  return s.failed.refit
    ? `Showing the last sheet Kalos read: ${prev}. The model was not rebuilt with your new columns.`
    : `Showing the last sheet Kalos read: ${prev}. Your new file ${s.failed.name} was not used.`;
}

/** A re-fit acts on the analysis; it is only offered when the analysis is not stale and a file is held. */
export const canActOnAnalysis = (s: SetupState): boolean => s.file !== null && s.failed === null;

/**
 * The header's next-step action: offered for every current analysis (the columns were chosen before the fit,
 * so there is nothing left to confirm), hidden for a stale one, for a sheet that failed its check, and before
 * any analysis exists.
 */
export type NextAction = { visible: boolean };

export function nextAction(s: SetupState, opts: { hasAnalysis: boolean; validationFailed: boolean }): NextAction {
  return { visible: opts.hasAnalysis && !opts.validationFailed && !isStale(s) };
}

/**
 * Runs one async action at a time. A call made while one is still in flight returns null and does
 * nothing: two uploads or re-fits racing each other would both write the engine and the page state.
 * A ref-held instance is used, not React state, so a second click in the same tick is refused too.
 */
export function singleFlight() {
  let inFlight = false;
  return async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    if (inFlight) return null;
    inFlight = true;
    try {
      return await fn();
    } finally {
      inFlight = false;
    }
  };
}

