import assert from "node:assert/strict";

let body = { data: { effective_budget: { scope: "member", limit_usd: 50, spend_usd: 40 }, free_model_daily_requests: { used: 2, limit: 50 } } };
let status = 200;
globalThis.fetch = async (url, options) => {
  assert.equal(url, "https://openrouter.ai/api/v1/key");
  assert.equal(options.headers.Authorization, "Bearer test-key");
  return new Response(JSON.stringify(body), { status });
};
const { getUsageForProvider } = await import("../../open-sse/services/usage.js");
const connection = { provider: "openrouter", apiKey: "test-key" };
let result = await getUsageForProvider(connection);
assert.equal(result.quotas["Effective budget (member)"].used, 40);
assert.equal(result.quotas["Free models daily (tier policy)"].total, 50);
body = { data: { limit: 0, limit_remaining: 0 } };
result = await getUsageForProvider(connection);
assert.equal(result.quotas["Key spending limit"].total, 0);
body = { data: { limit: null, limit_remaining: null } };
assert.match((await getUsageForProvider(connection)).message, /did not contain/);
status = 401;
assert.match((await getUsageForProvider(connection)).message, /401/);
assert.match((await getUsageForProvider({ provider: "openrouter" })).message, /key/i);