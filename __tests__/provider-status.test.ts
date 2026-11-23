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

  it("names the switch over configured when the engine also reports the provider available", () => {
    const p = { available: true, required_env: [], missing_env: [], disabled_by: ["KALOS_NO_PAID_CALLS"] };
    expect(providerSetupText(p)).toBe("turned off by KALOS_NO_PAID_CALLS on the engine");
  });

  it("treats an empty disabled_by like an engine without the field", () => {
    expect(providerSetupText({ available: false, required_env: ["NVIDIA_API_KEY"], missing_env: [], disabled_by: [] })).toBe("set NVIDIA_API_KEY on the engine to enable");
  });
});

describe("providerDisabledBy / providerOffText", () => {
  it("reports switches even when the provider says it is available, and none on engines without the field", () => {
    expect(providerDisabledBy({ disabled_by: ["KALOS_NO_PAID_CALLS"] })).toEqual(["KALOS_NO_PAID_CALLS"]);
    expect(providerDisabledBy({})).toEqual([]);
  });

  it("says paid calls are off for the paid-call switch, and a neutral line for others", () => {
    expect(providerOffText({ disabled_by: ["KALOS_NO_PAID_CALLS"] })).toBe("Paid AI calls are turned off on this engine.");
    expect(providerOffText({ disabled_by: ["SOME_OTHER_SWITCH"] })).toBe("Turned off in the engine's configuration.");
    expect(providerOffText({})).toBe("Without it, a built-in check is used instead.");
  });
});
