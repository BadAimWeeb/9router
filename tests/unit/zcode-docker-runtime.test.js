import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("ZCode Docker browser runtime", () => {
  it("uses a glibc image with Chromium libraries and a virtual display", () => {
    const dockerfile = readFileSync(new URL("../../Dockerfile", import.meta.url), "utf8");
    expect(dockerfile).toContain("node:22.23.4-bookworm-slim");
    const runner = dockerfile.split("AS runner")[1];
    expect(runner).toContain("gosu ffmpeg chromium xvfb");
  });
});