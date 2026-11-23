import { describe, expect, it } from "vitest";
import { providerDisabledBy, providerOffText, providerSetupText } from "@/lib/provider-status";

describe("providerSetupText", () => {
  it("says configured when the provider is available", () => {
    expect(providerSetupText({ available: true, required_env: ["ANTHROPIC_API_KEY"], missing_env: [] })).toBe("configured");
  });

  it("names the missing variables first, then the required ones", () => {
    expect(providerSetupText({ available: false, required_env: ["A", "B"], missing_env: ["B"] })).toBe("set B on the engine to enable");
    expect(providerSetupText({ available: false, required_env: ["NVIDIA_API_KEY"], missing_env: [] })).toBe("set NVIDIA_API_KEY on the engine to enable");
  });

  it("never renders an empty variable name when the engine lists none", () => {
    expect(providerSetupText({ available: false, required_env: [], missing_env: [] })).toBe("not enabled on the engine");
  });

  it("names the paid-call switch instead of asking for a key that is already set", () => {
    const p = { available: false, required_env: ["ANTHROPIC_API_KEY"], missing_env: [], disabled_by: ["KALOS_NO_PAID_CALLS"] };
    expect(providerSetupText(p)).toBe("turned off by KALOS_NO_PAID_CALLS on the engine");
  });

  it("still names a missing key behind the switch", () => {
    const p = { available: false, required_env: ["ANTHROPIC_API_KEY"], missing_env: ["ANTHROPIC_API_KEY"], disabled_by: ["KALOS_NO_PAID_CALLS"] };
    expect(providerSetupText(p)).toBe("turned off by KALOS_NO_PAID_CALLS on the engine; ANTHROPIC_API_KEY is also not set");
  });

  it("treats an empty disabled_by like an engine without the field", () => {
    expect(providerSetupText({ available: false, required_env: ["NVIDIA_API_KEY"], missing_env: [], disabled_by: [] })).toBe("set NVIDIA_API_KEY on the engine to enable");
  });
});

describe("providerDisabledBy / providerOffText", () => {
  it("ignores switches on an available provider and on engines without the field", () => {
    expect(providerDisabledBy({ available: true, disabled_by: ["KALOS_NO_PAID_CALLS"] })).toEqual([]);
    expect(providerDisabledBy({ available: false })).toEqual([]);
  });

  it("says paid calls are off for the paid-call switch, and a neutral line for others", () => {
    expect(providerOffText({ available: false, disabled_by: ["KALOS_NO_PAID_CALLS"] })).toMatch(/^Paid AI calls are turned off on this engine/);
    expect(providerOffText({ available: false, disabled_by: ["SOME_OTHER_SWITCH"] })).toMatch(/^Turned off in the engine's configuration/);
    expect(providerOffText({ available: false })).toBe("Without it, a built-in check is used instead.");
  });
});
