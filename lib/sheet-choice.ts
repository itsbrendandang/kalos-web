// Multi-sheet workbooks. When the engine reports several worksheets (`sheets`, with `sheet_used` on success, and
// possibly on a 400), the page offers a selector that re-submits the HELD file with `sheet`. Every field is
// optional: an engine that does not send them simply never produces a selector.

/** The worksheet names from an engine body, only when there is a real choice (two or more, all non-empty strings). */
export function sheetsFrom(body: { sheets?: unknown } | null | undefined): string[] {
  const list = body?.sheets;
  if (!Array.isArray(list)) return [];
  const names = list.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  return names.length > 1 ? names : [];
}

export type SheetSelector = {
  sheets: string[];
  /** The worksheet in use (null when the attempt failed and none was read). */
  current: string | null;
  /** Which file the choice re-submits: the rejected upload when the last attempt failed, else the held file. */
  target: File;
};

export function sheetSelector(opts: { heldFile: File | null; heldSheets: readonly string[]; sheetUsed: string | null; failed: { file: File; sheets: readonly string[] } | null }): SheetSelector | null {
  if (opts.failed) {
    return opts.failed.sheets.length > 1 ? { sheets: [...opts.failed.sheets], current: null, target: opts.failed.file } : null;
  }
  if (opts.heldFile && opts.heldSheets.length > 1) {
    const current = opts.sheetUsed && opts.heldSheets.includes(opts.sheetUsed) ? opts.sheetUsed : null;
    return { sheets: [...opts.heldSheets], current, target: opts.heldFile };
  }
  return null;
}
