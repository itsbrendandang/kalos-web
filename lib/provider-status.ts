import type { Provider } from "@/lib/api";

type ProviderState = Pick<Provider, "available" | "missing_env" | "required_env" | "disabled_by">;

export const PAID_CALLS_SWITCH = "KALOS_NO_PAID_CALLS";

/** The engine policy switches turning a provider off; they win over `available`, since the engine refuses every call. None on engines that do not report them. */
export function providerDisabledBy(p: Pick<Provider, "disabled_by">): string[] {
  return p.disabled_by ?? [];
}

/** The user-facing line under a provider that is turned off or unavailable. */
export function providerOffText(p: Pick<Provider, "disabled_by">): string {
  const off = providerDisabledBy(p);
  if (off.includes(PAID_CALLS_SWITCH)) return "Paid AI calls are turned off on this engine, so a built-in check is used instead.";
  if (off.length) return "Turned off in the engine's configuration, so a built-in check is used instead.";
  return "Without it, a built-in check is used instead.";
}

/** The administrator line for an optional integration, from the engine's provider status. */
export function providerSetupText(p: ProviderState): string {
  const off = providerDisabledBy(p);
  if (off.length) {
    const lead = `turned off by ${off.join(", ")} on the engine`;
    return p.missing_env.length ? `${lead}; ${p.missing_env.join(", ")} is also not set` : lead;
  }
  if (p.available) return "configured";
  const names = p.missing_env.length ? p.missing_env : p.required_env;
  // Some providers (e.g. Ollama) are switched on by engine configuration rather than a named key.
  return names.length ? `set ${names.join(", ")} on the engine to enable` : "not enabled on the engine";
}
