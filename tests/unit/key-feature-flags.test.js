// resolveKeyFeatureFlags: per-key token saver off switch + custom prompt
// override resolution, the exact function handleSingleModelChat applies before
// calling handleChatCore.
import { describe, it, expect } from "vitest";
import { resolveKeyFeatureFlags } from "@/sse/handlers/chat.js";

const globalOn = {
  rtkEnabled: true,
  headroomEnabled: true,
  cavemanEnabled: true,
  ponytailEnabled: true,
  customPromptEnabled: true,
  customPrompt: "global prompt",
};

describe("resolveKeyFeatureFlags", () => {
  it("no key record (local mode / unknown key): pure global", () => {
    expect(resolveKeyFeatureFlags(null, globalOn)).toEqual({
      tokenSaverForcedOff: false,
      rtkEnabled: true,
      headroomEnabled: true,
      cavemanEnabled: true,
      ponytailEnabled: true,
      customPromptEnabled: true,
      customPrompt: "global prompt",
    });
  });

  it("tokenSaverOverride inherit keeps every global saver on", () => {
    const flags = resolveKeyFeatureFlags({ tokenSaverOverride: "inherit" }, globalOn);
    expect(flags.tokenSaverForcedOff).toBe(false);
    expect(flags.rtkEnabled).toBe(true);
    expect(flags.cavemanEnabled).toBe(true);
  });

  it("tokenSaverOverride off forces every saver off, prompt untouched", () => {
    const flags = resolveKeyFeatureFlags({ tokenSaverOverride: "off" }, globalOn);
    expect(flags.tokenSaverForcedOff).toBe(true);
    expect(flags.rtkEnabled).toBe(false);
    expect(flags.headroomEnabled).toBe(false);
    expect(flags.cavemanEnabled).toBe(false);
    expect(flags.ponytailEnabled).toBe(false);
    expect(flags.customPromptEnabled).toBe(true);
    expect(flags.customPrompt).toBe("global prompt");
  });

  it("off cannot re-enable a globally disabled saver", () => {
    const off = { ...globalOn, rtkEnabled: false, cavemanEnabled: false };
    expect(resolveKeyFeatureFlags({ tokenSaverOverride: "off" }, off).rtkEnabled).toBe(false);
    expect(resolveKeyFeatureFlags({ tokenSaverOverride: "off" }, off).cavemanEnabled).toBe(false);
  });

  it("customPromptOverride replaces the global pair", () => {
    const flags = resolveKeyFeatureFlags(
      { customPromptOverride: { enabled: true, prompt: "key prompt" } },
      globalOn,
    );
    expect(flags.customPromptEnabled).toBe(true);
    expect(flags.customPrompt).toBe("key prompt");
  });

  it("customPromptOverride enabled:false disables injection for the key", () => {
    const flags = resolveKeyFeatureFlags(
      { customPromptOverride: { enabled: false, prompt: "unused" } },
      globalOn,
    );
    expect(flags.customPromptEnabled).toBe(false);
  });

  it("customPromptOverride with empty prompt yields empty customPrompt", () => {
    const flags = resolveKeyFeatureFlags(
      { customPromptOverride: { enabled: true, prompt: "" } },
      globalOn,
    );
    expect(flags.customPromptEnabled).toBe(true);
    expect(flags.customPrompt).toBe("");
  });
});
