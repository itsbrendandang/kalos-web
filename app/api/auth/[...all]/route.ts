import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Better Auth's own endpoints (OAuth start/callback, get-session, two-factor,
// organization, sign-out). Policy and the MFA gate: lib/server/auth-config.mjs.
export async function GET(request: Request) {
  return toNextJsHandler(getAuth()).GET(request);
}
export async function POST(request: Request) {
  return toNextJsHandler(getAuth()).POST(request);
}
