// Client-side preflight for run-sheet uploads: extension + size, checked before
// a file is read or sent. The engine (and the proxy, see
// app/api/engine/[...path]/route.ts) enforce the real limit; this just gives the
// user a visible, immediate rejection instead of a failed request.
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // the engine's KALOS_MAX_UPLOAD_MB default
export const ALLOWED_EXTENSIONS = [".csv", ".tsv", ".xlsx", ".xls"] as const;
/** Enough of a text sheet to read its header row without loading the whole file. */
export const HEADER_PEEK_BYTES = 64 * 1024;

/** A user-facing rejection reason, or null when the file may be uploaded. */
export function preflightFile(file: { name: string; size: number }, maxBytes = MAX_UPLOAD_BYTES): string | null {
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return `"${file.name}" is not a supported file type. Use ${ALLOWED_EXTENSIONS.join(", ")}.`;
  }
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > maxBytes) {
    return `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${Math.floor(maxBytes / 1024 / 1024)} MB.`;
  }
  return null;
}
