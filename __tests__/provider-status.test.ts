import { describe, expect, it } from "vitest";
import { providerSetupText } from "@/lib/provider-status";

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
});
