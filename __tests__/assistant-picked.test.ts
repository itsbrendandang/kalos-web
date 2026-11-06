import { describe, expect, it } from "vitest";
import { pickedLine } from "@/components/assist/assistant-settings";

/*
 * The desktop app leaves KALOS_LLM_PROVIDER unset (desktop/src-tauri/src/main.rs),
 * so Kalos picks Ollama when it answers on this Mac and none otherwise. Settings
 * says which happened, in plain words; a server says the setting is fixed.
 */
describe("pickedLine", () => {
  it("says what the desktop app found at launch", () => {
    expect(pickedLine("ollama", true)).toBe("Picked when the app started: Ollama was running on this Mac, so answers stay here.");
    expect(pickedLine("none", true)).toBe("Picked when the app started: no Ollama was found on this Mac, so the assistant is off.");
  });
  it("says a server's setting is fixed", () => {
    expect(pickedLine("ollama", false)).toBe("Set by whoever started Kalos. It cannot be changed here.");
  });
});
