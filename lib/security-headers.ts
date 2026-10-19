/**
 * Content-Security-Policy for the statically rendered app.
 *
 * Production script-src keeps 'unsafe-inline': a nonce would force every page
 * to render dynamically, and a sha256 of the theme script in app/layout.tsx
 * does NOT help - Next's own inline flight scripts (`self.__next_f.push(...)`)
 * differ per page, and once any hash/nonce is in script-src browsers ignore
 * 'unsafe-inline' and block them (verified: hydration breaks). The rest of the
 * policy is strict (no objects, no framing, same-origin connect/form/base).
 * No upgrade-insecure-requests: the stack can be served over plain http. Dev
 * additionally needs 'unsafe-eval' for React's debugging.
 */
export function buildCsp(isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function securityHeaders(isDev: boolean): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: buildCsp(isDev) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  ];
}
