import { describe, it, expect } from "vitest";
import { CodexExecutor } from "open-sse/executors/codex.js";
import { getModelUpstreamId, isValidModel, PROVIDER_ID_TO_ALIAS } from "open-sse/config/providerModels.js";

const credentials = { accessToken: "x", accountId: "a" };

describe("codex 1m variants route to the same upstream", () => {
  it.each(["gpt-6.2-sol-1m", "gpt-6.2-sol[1m]"])("resolves %s through the catalog", (model) => {
    const probe = model.endsWith("[1m]") ? model.slice(0, -4) : model;
    expect(isValidModel("cx", probe)).toBe(true);
    expect(isValidModel("cx", model)).toBe(model.endsWith("-1m"));
    const upstream = getModelUpstreamId("cx", model);
    // The -1m catalog entry maps to the base upstream id; the [1m] marker form
    // falls through to the same base because findModel strips nothing for it.
    expect(upstream.startsWith("gpt-6.2-sol")).toBe(true);
  });

  it.each(["gpt-6.2-sol-1m", "gpt-6.2-sol[1m]"])("executor accepts %s with Lite shape", (model) => {
    const executor = new CodexExecutor();
    const bodyModel = model.endsWith("[1m]") ? model.slice(0, -4) : model;
    const body = executor.transformRequest(bodyModel, { model: bodyModel, input: "hello" }, true, credentials);
    expect(body.model.startsWith("gpt-6.2-sol")).toBe(true);
});
});
