// Codex-specific tool JSON Schema compatibility.
//
// `https://chatgpt.com/backend-api/codex/responses` validates every function
// tool's `parameters` with a regex engine that does not implement Unicode
// property escapes. A `pattern` such as
//
//   "^(?!__.*__$)[^\\p{Cc}\\p{Cf}\\p{Zl}\\p{Zp}\"\\\\./\\[\\]]{1,200}$"
//
// is a perfectly valid ECMAScript `u`-mode regex, but Codex answers
//
//   400 Invalid schema for function 'Artifact': '^\p{Cc}...' is not a 'regex'
//   param: tools[0].parameters
//
// The request is deterministically malformed for this provider, so every
// account fails identically and the combo pays a full failover before landing
// somewhere that accepts it (#3922).
//
// Scope guardrail (#3667): this is NOT a global schema sanitizer. Only the
// Codex dispatch path removes Unicode-property patterns and `uniqueItems`.
// Supported constraints, schema-map names, and literal data remain unchanged.

// `\p{...}` / `\P{...}` with an odd number of preceding backslashes — an even
// count means the backslash itself is escaped, so `\\p{Cc}` is a literal "p".
const UNICODE_PROPERTY_ESCAPE = /(^|[^\\])(\\\\)*\\[pP]\{/;

export function hasUnicodePropertyEscape(pattern) {
  return typeof pattern === "string" && UNICODE_PROPERTY_ESCAPE.test(pattern);
}

// Only schema-bearing keywords recurse: annotations and literal values are data.
const SCHEMA_MAPS = new Set(["properties", "patternProperties", "$defs", "definitions", "dependentSchemas", "dependencies"]);
const SCHEMA_CHILDREN = new Set([
  "items", "prefixItems", "additionalItems", "contains", "additionalProperties",
  "unevaluatedItems", "unevaluatedProperties", "propertyNames", "allOf", "anyOf",
  "oneOf", "not", "if", "then", "else", "contentSchema",
]);

// Copy only changed paths, retaining identity (and avoiding copies) on a no-op.
function stripNode(node, stats, schemaMap = false) {
  if (Array.isArray(node)) {
    let next;
    for (let i = 0; i < node.length; i++) {
      const cleaned = stripNode(node[i], stats);
      if (cleaned !== node[i]) {
        next ??= node.slice();
        next[i] = cleaned;
      }
    }
    return next ?? node;
  }
  if (!node || typeof node !== "object") return node;

  let next;
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (!schemaMap && ((key === "pattern" && hasUnicodePropertyEscape(value)) || key === "uniqueItems")) {
      stats.removed++;
      next ??= { ...node };
      delete next[key];
      continue;
    }
    const cleaned = schemaMap || SCHEMA_CHILDREN.has(key)
      ? stripNode(value, stats)
      : SCHEMA_MAPS.has(key) ? stripNode(value, stats, true) : value;
    if (cleaned !== value) {
      next ??= { ...node };
      Object.defineProperty(next, key, { value: cleaned, enumerable: true, configurable: true, writable: true });
    }
  }
  return next ?? node;
}

// Remove only Unicode-property patterns and uniqueItems rejected by Codex.
// Returns the same reference when the schema is already compatible.
export function stripCodexUnsupportedPatterns(schema, stats = { removed: 0 }) {
  return stripNode(schema, stats);
}
