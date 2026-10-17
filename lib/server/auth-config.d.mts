// Types for auth-config.mjs (plain ESM so node scripts and tests can import it).
import type { betterAuth } from "better-auth";

export const SESSION_TTL_SECONDS: number;
export const UNVERIFIED_SESSION_TTL_SECONDS: number;
export const MFA_MAX_FAILURES_PER_SESSION: number;
export const MFA_MAX_FAILURES_PER_USER: number;
export const MFA_USER_LOCK_SECONDS: number;
export const RECENT_AUTH_MAX_AGE_SECONDS: number;
export const GOOGLE_SCOPES: readonly string[];
export const MFA_VERIFY_PATHS: ReadonlySet<string>;
export const ALLOWED_WITHOUT_MFA: ReadonlySet<string>;
export const RECENT_MFA_PATHS: ReadonlySet<string>;
export const DISABLED_PATHS: readonly string[];
export const KALOS_RESOURCES: readonly string[];
export const ROLE_NAMES: readonly string[];
export const statements: Record<string, readonly string[]>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ac: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const roles: Record<string, any>;

export interface BetterAuthSessionLike {
  session: { id: string; token?: string; userId: string; createdAt?: Date | string; expiresAt?: Date | string; mfaVerifiedAt?: Date | string | null; activeOrganizationId?: string | null };
  user: { id: string; email?: string; twoFactorEnabled?: boolean | null };
}

export function mfaSatisfied(sessionData: BetterAuthSessionLike | null | undefined): boolean;
export function mfaVerifiedAtSeconds(sessionData: BetterAuthSessionLike | null | undefined): number | null;
export function parseRoles(roleValue: unknown): string[];
export function permissionsForRole(roleValue: unknown): string[];
export function hasPendingInvitation(adapter: unknown, email: unknown): Promise<boolean>;
export function validateUserInfo(
  data: { user: Record<string, unknown>; source: { method: string; action: string; oauth?: { providerId: string } } },
  ctx?: unknown,
): Promise<void | { error: string; errorDescription?: string }>;
export function assertSocialRequestAllowed(path: string | undefined, body: unknown): void;
export function mfaGateDecision(
  path: string | undefined,
  sessionData: BetterAuthSessionLike | null | undefined,
  nowMs?: number,
): "allow" | "mfa_required" | "step_up_required";

export const MAX_PROFILE_NAME_LENGTH: number;
export const MAX_PROFILE_IMAGE_LENGTH: number;
export function assertProfileUpdateAllowed(body: unknown): void;
export function redactFullOrganization<T>(org: T, opts: { isAdmin: boolean }): T;
export function assertCanListInvitations(ctx: unknown, sessionData: BetterAuthSessionLike): Promise<void>;
export function gateSessionLookup<T>(lookup: () => Promise<T>, headers: Headers | undefined): Promise<T | null>;
export function userMfaLocked(row: { lockedUntil?: Date | string | null } | null | undefined, nowMs?: number): boolean;
export function reserveUserAttempt(
  row: { failedVerificationCount?: number | null; lockedUntil?: Date | string | null } | null | undefined,
  nowMs?: number,
): { allowed: boolean; update: { failedVerificationCount: number; lockedUntil: Date | null } | null };
export function lockIfExhausted(
  row: { failedVerificationCount?: number | null; lockedUntil?: Date | string | null } | null | undefined,
  nowMs?: number,
): { failedVerificationCount: number; lockedUntil: Date } | null;
export const MFA_ACCOUNTING_TIMEOUT_MS: number;
export function exclusiveMfaAccounting<T>(key: string, fn: () => T | Promise<T>, opts?: { timeoutMs?: number }): Promise<T>;

export interface MakeAuthOptions {
  database: unknown;
  baseURL: string;
  secret: string | undefined;
  googleClientId: string;
  googleClientSecret: string;
  trustedProxies?: string[];
  ipAddressHeaders?: string[];
  secureCookies?: boolean;
  rateLimit?: Record<string, unknown> | false;
  logger?: Record<string, unknown>;
  extraPlugins?: unknown[];
}
export type KalosAuth = ReturnType<typeof betterAuth>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeAuth(o: MakeAuthOptions): any;
export function ipAddressOptions(o?: { trustedProxies?: string[]; ipAddressHeaders?: string[] }): {
  ipAddressHeaders: string[];
  trustedProxies?: string[];
  ipv6Subnet: number;
};
export function authOptionsFromEnv(env?: Record<string, string | undefined>): Omit<MakeAuthOptions, "database">;
