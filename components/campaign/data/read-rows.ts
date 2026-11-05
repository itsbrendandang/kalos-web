// Reads every cell of a dropped run sheet in the browser, for "Your data".
// CSV/TSV use the same reader as the setup row-type check; .xlsx uses lib/xlsx-rows.ts.
// Legacy .xls and files over SCAN_MAX_BYTES are not read (the view says so). Never throws.
import { parseDelimited, SCAN_MAX_BYTES } from "@/lib/sheet-columns";
import { readXlsxRows } from "@/lib/xlsx-rows";

export type SheetRead =
  | { ok: true; rows: string[][]; sheetUsed: string | null }
  | { ok: false; reason: "too-large" | "unreadable" };

/** The rows of the first sheet (or `sheet`, for a workbook): header first. */
export async function readSheetRows(file: File, sheet?: string): Promise<SheetRead> {
  if (file.size > SCAN_MAX_BYTES) return { ok: false, reason: "too-large" };
  try {
    if (/\.xlsx$/i.test(file.name)) {
      const x = await readXlsxRows(await file.arrayBuffer(), sheet);
      return x ? { ok: true, rows: x.rows, sheetUsed: x.sheetUsed } : { ok: false, reason: "unreadable" };
    }
    if (/\.(csv|tsv|txt)$/i.test(file.name)) {
      return { ok: true, rows: parseDelimited(await file.text()), sheetUsed: null };
    }
    return { ok: false, reason: "unreadable" };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}
