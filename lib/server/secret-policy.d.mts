// Types for secret-policy.mjs.
export const DEV_ONLY_INSECURE_SECRET: string;
export function isLoopbackUrl(raw: string | undefined | null): boolean;
export function devFallbackAllowed(env: Readonly<Record<string, string | undefined>>): boolean;
export function bootCheckRequired(env: Readonly<Record<string, string | undefined>>): boolean;
