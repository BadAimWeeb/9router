import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("lazy runtime production bundling", () => {
  it("does not use createRequire.resolve, which webpack compiles to undefined.resolve", () => {
    const source = readFileSync(new URL("../../open-sse/services/lazyRuntime.js", import.meta.url), "utf8");
    expect(source).not.toContain("createRequire");
    expect(source).not.toContain(".resolve(pkg)");
    expect(source).toContain("node_modules");
  });
});