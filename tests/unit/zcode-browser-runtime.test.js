import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("ZCode browser runtime", () => {
  it("loads CloakBrowser through the lazy runtime rather than a silent optional import", () => {
    const source = readFileSync(new URL("../../open-sse/services/browserPool.js", import.meta.url), "utf8");
    expect(source).toContain('loadRuntimeDep("cloakbrowser")');
    expect(source).not.toContain('getCloakbrowserModuleId');
  });
});