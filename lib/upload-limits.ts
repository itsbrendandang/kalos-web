// The operator sets KALOS_MAX_UPLOAD_MB (same name and default as the engine,
// kalos/portal/uploads.py). Only the server reads it: the proxy enforces the
// limit and answers 413 when a body is over it. The browser is NOT told the
// limit (next.config.ts does not inline it), so the client does no size pre-check.
export const DEFAULT_MAX_UPLOAD_MB = 25;

/** Extra bytes the proxy allows on top of the file limit: a multipart request carries the boundary,
 *  part headers and the other form fields (target, roles) as well as the file itself. */
export const MULTIPART_HEADROOM_BYTES = 1024 * 1024;

/** The per-FILE limit in bytes from a raw MB setting; invalid or empty falls back to the default. */
export function uploadLimitBytes(rawMb?: string | null): number {
  const mb = rawMb?.trim() ? Number(rawMb) : NaN;
  return Math.floor((Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_MAX_UPLOAD_MB) * 1024 * 1024);
}

/** The most bytes of REQUEST BODY the proxy forwards: the file limit plus multipart overhead. */
export function proxyBodyCapBytes(rawMb?: string | null): number {
  return uploadLimitBytes(rawMb) + MULTIPART_HEADROOM_BYTES;
}
