import { proxyAwareFetch } from "../../utils/proxyFetch.js";
import { U } from "./shared.js";

export async function getOpenRouterUsage(apiKey, proxyOptions = null) {
  if (typeof apiKey !== "string" || !apiKey.trim()) return { message: "OpenRouter API key not available." };
  try {
    const response = await proxyAwareFetch(U("openrouter").url, {
      headers: { Authorization: `Bearer ${apiKey.trim()}`, Accept: "application/json" },
    }, proxyOptions);
    if (!response.ok) return { message: `OpenRouter usage API error (${response.status}).` };
    const { data } = await response.json();
    const quotas = {};
    const valid = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;
    const budget = data?.effective_budget;
    if (budget && valid(budget.limit_usd) && valid(budget.spend_usd)) {
      quotas[`Effective budget (${budget.scope || "unknown"})`] = {
        used: budget.spend_usd, total: budget.limit_usd, unit: "USD", resetAt: budget.resets_at,
      };
    } else if (valid(data?.limit) && typeof data?.limit_remaining === "number" && Number.isFinite(data.limit_remaining)) {
      quotas["Key spending limit"] = {
        used: Math.max(0, data.limit - data.limit_remaining), total: data.limit, unit: "USD",
        emptyMessage: data.limit_reset ? `Resets ${data.limit_reset}` : "Never resets",
      };
    }
    const daily = data?.free_model_daily_requests;
    if (daily && valid(daily.used) && valid(daily.limit)) {
      quotas["Free models daily (tier policy)"] = {
        used: daily.used, total: daily.limit, unit: "requests",
        resetAt: new Date(Math.floor(Date.now() / 86400000) * 86400000 + 86400000).toISOString(),
      };
    }
    // ponytail: only the effective budget is shown; add individual budgets when per-budget tracking is needed.
    return Object.keys(quotas).length ? { plan: "OpenRouter", quotas } : { message: "OpenRouter response did not contain limit data." };
  } catch {
    return { message: "Unable to fetch OpenRouter limits." };
  }
}