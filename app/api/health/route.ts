import { authDb } from "@/lib/server/auth-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Liveness + auth DB reachability for the container HEALTHCHECK. Public
// (proxy.ts) and deliberately uninformative: no paths, versions or counts.
export async function GET() {
  try {
    authDb().prepare("SELECT 1").get();
    return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
