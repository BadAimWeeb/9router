import { expect, it } from "vitest";
import { getModelUpstreamId, isValidModel } from "../../open-sse/config/providerModels.js";
import { getThinkingLevels } from "../../open-sse/providers/thinkingLevels.js";
import { getPricingForModel } from "../../open-sse/providers/pricing.js";
import { applyThinking, stripThinkingSuffix } from "../../open-sse/translator/concerns/thinkingUnified.js";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";

it.each(["low", "medium", "high", "xhigh"])("routes Neon with %s thinking without inventing tier IDs", (level) => {
  expect(isValidModel("ag", "gemini-4-neon")).toBe(true);
  expect(getThinkingLevels("antigravity", "gemini-4-neon")).toEqual(["low", "medium", "high", "xhigh"]);
  expect(getModelUpstreamId("ag", "gemini-4-neon")).toBe("gemini-4-neon");
  const model = getModelUpstreamId("ag", "gemini-4-neon", { reasoning_effort: level });
  const body = { model: stripThinkingSuffix(model), reasoning_effort: level, request: { contents: [{ role: "user", parts: [{ text: "hi" }] }], generationConfig: {} } };
  applyThinking("antigravity", model, body, "antigravity");
  const request = new AntigravityExecutor().transformRequest(stripThinkingSuffix(model), body, true, {});
  expect(request.model).toBe("gemini-4-neon");
  expect(request.request.generationConfig.thinkingConfig.thinkingLevel).toBe(level);
});

it("uses Neon pricing rather than the generic Gemini 4 fallback", () => {
  expect(getPricingForModel("antigravity", "gemini-4-neon")).toEqual({
    input: 3, output: 15, cached: 0.15, reasoning: 15, cache_creation: 3,
  });
});
