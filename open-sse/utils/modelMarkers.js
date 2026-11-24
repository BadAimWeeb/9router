import { getProviderModels } from "../config/providerModels.js";

// Claude Code appends a bracketed context marker to the model name when the
// 1M-context beta is toggled on: `claude-opus-5` becomes `claude-opus-5[1m]`.
// The marker is a client-side annotation, not part of any model id: it never
// matches a combo name, an alias or a `provider/model` pair, so a request that
// carries it dies at model resolution with "Invalid model format".
//
// The capability itself travels in the `anthropic-beta: context-1m-2025-08-07`
// header, which is forwarded untouched — stripping the marker is enough to let
// the request route normally and still reach the upstream as a 1M request.

const CONTEXT_MARKER = /\[1m\]$/i;

// Codex extended-context catalog ids use the `-1m` suffix (e.g. `cx/gpt-6.2-sol-1m`).
// A Claude Code `[1m]` marker on such a model is rewritten to the `-1m` id so
// capability/pricing lookup and the upstream model name resolve through the
// catalog instead of relying on the beta header alone.
const ONE_M_CATALOG_SUFFIX = /-1m$/;

/**
 * True when `model` names a catalog entry whose `-1m` variant exists in the
 * Codex registry. Provider is inferred from the id itself (gpt-* on `cx`).
 * @param {string} model
 * @returns {boolean}
 */
export function hasOneMCatalogVariant(model) {
  const bare = String(model || "").includes("/")
    ? String(model).slice(String(model).lastIndexOf("/") + 1)
    : String(model || "");
  const id = bare.replace(/\([^()]+\)\s*$/, "").trim();
  if (!/^gpt-/.test(id) || ONE_M_CATALOG_SUFFIX.test(id)) return false;
  return getProviderModels("cx")?.some?.((entry) => entry.id === `${id}-1m`) === true;
}

// Returns { model, contextMarker } — contextMarker is null when there is none.
export function stripModelContextMarker(modelStr) {
  if (typeof modelStr !== "string") return { model: modelStr, contextMarker: null };
  const trimmed = modelStr.trim();
  const match = trimmed.match(CONTEXT_MARKER);
  if (!match) return { model: modelStr, contextMarker: null };
  return { model: trimmed.slice(0, -match[0].length), contextMarker: match[0].slice(1, -1).toLowerCase() };
}
