import { describe, expect, it } from "vitest";
import { applyThinking } from "../../open-sse/translator/concerns/thinkingUnified.js";
import { getThinkingLevels } from "../../open-sse/providers/thinkingLevels.js";
import { getModelUpstreamId, isValidModel } from "../../open-sse/config/providerModels.js";
import { effortToThinkingLevel } from "../../open-sse/translator/concerns/thinking.js";
import "../translator/registerAll.js";

// Wire the request the way chatCore does: resolve the upstream id (suffix-aware),
// then normalize thinking for the antigravity target format against that id.
function wireLevel(agModel, effort) {
  const upstream = getModelUpstreamId("ag", agModel, { reasoning_effort: effort });
  const body = { reasoning_effort: effort, request: { generationConfig: {} } };
  applyThinking("antigravity", upstream, body, "antigravity");
  return { upstream, level: body.request?.generationConfig?.thinkingConfig?.thinkingLevel };
}

describe("Gemini 4 Hydrogen xhigh tier", () => {
  it("advertises low|medium|high|xhigh for hydrogen only, not carbon/argon", () => {
    expect(getThinkingLevels("antigravity", "gemini-4-hydrogen-medium")).toEqual(["low", "medium", "high", "xhigh"]);
    expect(getThinkingLevels("antigravity", "gemini-4-hydrogen-xhigh")).toEqual(["low", "medium", "high", "xhigh"]);
    expect(getThinkingLevels("antigravity", "gemini-4-carbon-medium")).toEqual(["low", "medium", "high"]);
    expect(getThinkingLevels("antigravity", "gemini-4-argon-high")).toEqual(["low", "medium", "high"]);
  });

  it("sends thinkingLevel xhigh on the wire for hydrogen", () => {
    // The tier id swaps to the actual xhigh tier variant (upstream tiers are
    // per-level model ids), and the preset suffix carries the level.
    const { upstream, level } = wireLevel("gemini-4-hydrogen-medium", "xhigh");
    expect(upstream).toBe("gemini-4-hydrogen-xhigh(xhigh)");
    expect(level).toBe("xhigh");
  });

  it("clamps xhigh to high on carbon/argon (tier not advertised, never above the ask)", () => {
    const carbon = wireLevel("gemini-4-carbon-medium", "xhigh");
    expect(carbon.level).toBe("high");
    const argon = wireLevel("gemini-4-argon-medium", "xhigh");
    expect(argon.level).toBe("high");
  });

  it("keeps non-xhigh levels untouched across the family", () => {
    expect(wireLevel("gemini-4-hydrogen-medium", "low").level).toBe("low");
    expect(wireLevel("gemini-4-hydrogen-medium", "high").level).toBe("high");
    expect(wireLevel("gemini-4-carbon-medium", "medium").level).toBe("medium");
  });

  it("resolves the bare gemini-4-hydrogen-xhigh tier id end to end", () => {
    expect(isValidModel("ag", "gemini-4-hydrogen-xhigh")).toBe(true);
    expect(getModelUpstreamId("ag", "gemini-4-hydrogen-xhigh")).toBe("gemini-4-hydrogen-xhigh(xhigh)");
    const body = { request: { generationConfig: {} } };
    applyThinking("antigravity", "gemini-4-hydrogen-xhigh(xhigh)", body, "antigravity");
    expect(body.request.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "xhigh", includeThoughts: true });
  });

  it("maps body effort xhigh to the xhigh tier upstream id (not the high tier)", () => {
    expect(getModelUpstreamId("ag", "gemini-4-hydrogen-medium", { reasoning_effort: "xhigh" }))
      .toBe("gemini-4-hydrogen-xhigh(xhigh)");
    // carbon has no xhigh tier entry — body effort xhigh falls back to the high tier id
    expect(getModelUpstreamId("ag", "gemini-4-carbon-medium", { reasoning_effort: "xhigh" }))
      .toBe("gemini-4-carbon-high(high)");
  });

  it("still clamps max to high on the gemini enum", () => {
    expect(effortToThinkingLevel("max")).toBe("high");
    expect(effortToThinkingLevel("xhigh")).toBe("xhigh");
    expect(wireLevel("gemini-4-carbon-medium", "max").level).toBe("high");
    // hydrogen has no max tier either — xhigh is the top
    expect(wireLevel("gemini-4-hydrogen-medium", "max").level).toBe("xhigh");
  });
});
