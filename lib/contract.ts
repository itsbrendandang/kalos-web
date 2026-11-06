// The engine HTTP contract this web build expects.
//
// The engine sends one integer, its contract version, as the
// `X-Kalos-Contract` header on every response, as `contract_version` in
// GET /api/health and in every analysis body, and as `info.x-kalos-contract`
// in its committed spec (kalos-engine docs/openapi.json, written by
// scripts/export_openapi.py). Within one version fields are only added; a
// removal or a change of meaning bumps it (kalos-engine docs/CAMPAIGNS_API.md,
// "Contract version").
//
// __tests__/contract-version.test.ts checks these numbers and the proxy's
// route table (lib/server/engine-routes.ts) against a copy of that spec in
// __tests__/fixtures/engine-openapi.json. Refresh the copy when the engine
// spec changes, then bump EXPECTED_ENGINE_CONTRACT in the same commit.
// Pure: no I/O, no env.

/** The engine contract version this web build was written against. */
export const EXPECTED_ENGINE_CONTRACT = 3;

/** The oldest engine contract this web build can still render. */
export const MIN_ENGINE_CONTRACT = 3;

/** Response header that carries the engine's contract version. */
export const CONTRACT_HEADER = "X-Kalos-Contract";

export type ContractStatus = "ok" | "engine-too-old" | "engine-newer" | "unknown";

/** Compare an engine-reported contract version (header or health field) with this build. */
export function contractStatus(reported: unknown): ContractStatus {
  const value = typeof reported === "string" && reported.trim() !== "" ? Number(reported) : reported;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return "unknown";
  if (value < MIN_ENGINE_CONTRACT) return "engine-too-old";
  if (value > EXPECTED_ENGINE_CONTRACT) return "engine-newer";
  return "ok";
}
