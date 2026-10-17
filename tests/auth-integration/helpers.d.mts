/* eslint-disable @typescript-eslint/no-explicit-any */
// Loose types for helpers.mjs (test-only harness).
export const BASE: string;
export const GOOGLE_CLIENT_ID: string;
export const TEST_SECRET: string;
export function tempDir(prefix?: string): string;
export function openDb(file: string): any;
export function freshAuth(opts?: Record<string, unknown>): Promise<{ auth: any; db: any; file: string; dir: string; cleanup: () => void }>;
export interface TestClient {
  req(path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string>; raw?: boolean }): Promise<any>;
  jar: Map<string, string>;
  headers(): Headers;
}
export function client(auth: any, opts?: { ip?: string; userAgent?: string }): TestClient;
export function totpNow(totpURI: string): Promise<string>;
export function totpAt(totpURI: string, offset?: number): Promise<string>;
export function makeSigner(): Promise<{ jwk: any; sign: (claims: Record<string, unknown>) => Promise<string> }>;
export function interceptGoogle(signer: any, getClaims: () => Record<string, unknown>): { calls: any[]; restore: () => void };
export function googleSignIn(c: TestClient, startBody?: Record<string, unknown>): Promise<any>;
export function enrolTotp(c: TestClient): Promise<{ totpURI: string; backupCodes: string[] }>;
