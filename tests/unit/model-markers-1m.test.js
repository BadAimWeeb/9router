import { describe, it, expect } from "vitest";
import { hasOneMCatalogVariant, stripModelContextMarker } from "open-sse/utils/modelMarkers.js";
import { getProviderModels } from "open-sse/config/providerModels.js";

describe("1M variant normalization", () => {
  it("maps gpt-6.2-sol[1m] onto the -1m catalog id", () => {
    const { model, contextMarker } = stripModelContextMarker("cx/gpt-6.2-sol[1m]");
    expect(contextMarker.toLowerCase()).toBe("1m");
    expect(hasOneMCatalogVariant(model)).toBe(true);
    expect(getProviderModels("cx").some((e) => e.id === `${model.split("/").pop()}-1m`)).toBe(true);
  });

  it("leaves non-Codex markers alone (no -1m rewrite)", () => {
    expect(hasOneMCatalogVariant("claude-opus-5")).toBe(false);
    expect(hasOneMCatalogVariant("gemini-3.8-flash")).toBe(false);
  });

  it("ignores ids that already end in -1m", () => {
    expect(hasOneMCatalogVariant("gpt-6.2-sol-1m")).toBe(false);
  });

  it("accepts provider-prefixed ids", () => {
    expect(hasOneMCatalogVariant("cx/gpt-6.2-astra")).toBe(true);
    expect(hasOneMCatalogVariant("openai/gpt-6.2-sol")).toBe(true);
  });
});
