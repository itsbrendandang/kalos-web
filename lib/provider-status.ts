import type { Provider } from "@/lib/api";

/** The administrator line for an optional integration, from the engine's provider status. */
export function providerSetupText(p: Pick<Provider, "available" | "missing_env" | "required_env">): string {
  if (p.available) return "configured";
  const names = p.missing_env.length ? p.missing_env : p.required_env;
  // Some providers (e.g. Ollama) are switched on by engine configuration rather than a named key.
  return names.length ? `set ${names.join(", ")} on the engine to enable` : "not enabled on the engine";
}
