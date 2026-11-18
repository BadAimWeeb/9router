import { describe, expect, it } from "vitest";

import { CodexExecutor } from "../../open-sse/executors/codex.js";
import { stripCodexUnsupportedPatterns } from "../../open-sse/utils/codexToolSchema.js";

function normalizeTools(tools) {
  const executor = new CodexExecutor();
  const body = {
    model: "gpt-5.6-terra",
    input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "probe" }] }],
    tools,
    stream: true,
  };

  executor.transformRequest("gpt-5.6-terra", body, true, {
    connectionId: "test-codex-tools",
    providerSpecificData: {},
  });

  return body.tools;
}

describe("CodexExecutor tool normalization", () => {
  it("preserves explicit strict flags without changing optional arguments", () => {
    const parameters = {
      type: "object",
      properties: { sessionID: { type: "string" } },
      required: [],
    };
    const tools = normalizeTools([
      { type: "function", name: "flat_false", strict: false, parameters },
      { type: "function", name: "flat_true", strict: true, parameters },
      { type: "function", function: { name: "nested_false", strict: false, parameters } },
      { type: "function", function: { name: "nested_true", strict: true, parameters } },
      { type: "function", name: "unspecified", parameters },
    ]);

    expect(tools.map((tool) => tool.strict)).toEqual([false, true, false, true, undefined]);
    for (const tool of tools) {
      expect(tool.parameters).toEqual(parameters);
      expect(tool.parameters.required).toEqual([]);
    }
    expect(tools[4]).not.toHaveProperty("strict");
  });

  it("preserves Responses text.format for structured outputs", () => {
    const executor = new CodexExecutor();
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
      },
      required: ["title"],
    };
    const body = {
      model: "gpt-5.4-mini",
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "test for session title" }] }],
      stream: true,
      metadata: { unsupported: true },
      text: {
        format: {
          type: "json_schema",
          name: "codex_output_schema",
          strict: true,
          schema,
        },
      },
    };

    executor.transformRequest("gpt-5.4-mini", body, true, {
      connectionId: "test-codex-structured-output",
      providerSpecificData: {},
    });

    expect(body.text).toEqual({
      format: {
        type: "json_schema",
        name: "codex_output_schema",
        strict: true,
        schema,
      },
    });
    expect(body.metadata).toBeUndefined();
  });

  it("preserves Responses-native tool_search tools", () => {
    const tools = normalizeTools([
      {
        type: "tool_search",
        execution: "sync",
        description: "Discover deferred tools",
        parameters: { type: "object", properties: {} },
      },
      {
        type: "namespace",
        name: "codex_app",
        description: "app tools",
        tools: [
          {
            type: "function",
            name: "automation_update",
            description: "automation",
            parameters: { type: "object", properties: {} },
            defer_loading: true,
          },
        ],
      },
      {
        type: "function",
        name: "plain_fn",
        description: "plain",
        parameters: { type: "object", properties: {} },
      },
    ]);

    expect(tools.map((tool) => `${tool.type}:${tool.name || ""}`)).toEqual([
      "tool_search:",
      "namespace:codex_app",
      "function:plain_fn",
    ]);
  });

  it("preserves hosted Responses tools", () => {
    const tools = normalizeTools([
      { type: "web_search", search_context_size: "medium" },
      { type: "image_generation", size: "1024x1024" },
      { type: "mcp", server_label: "docs", server_url: "https://example.com/mcp" },
      { type: "local_shell" },
      { type: "code_interpreter", container: { type: "auto" } },
      { type: "computer", display_width: 1024, display_height: 768, environment: "browser" },
    ]);

    expect(tools.map((tool) => tool.type)).toEqual([
      "web_search",
      "image_generation",
      "mcp",
      "local_shell",
      "code_interpreter",
      "computer",
    ]);
  });

  it("strips only Unicode-property patterns rejected by Codex", () => {
    const unicodePattern = "^(?!__.*__$)[^\\p{Cc}\\p{Cf}\\p{Zl}\\p{Zp}]{1,200}$";
    const validPattern = "^[a-z][a-z0-9_-]{0,31}$";
    const sourceParameters = {
      type: "object",
      properties: {
        artifact: {
          type: "object",
          properties: {
            name: { type: "string", pattern: unicodePattern },
            slug: { type: "string", pattern: validPattern },
          },
        },
        // A property named "pattern" is data, not the schema keyword.
        pattern: { type: "string", pattern: validPattern },
      },
      allOf: [{ properties: { title: { type: "string", pattern: unicodePattern } } }],
    };
    const tools = normalizeTools([{
      type: "function",
      name: "Artifact",
      parameters: sourceParameters,
    }]);

    expect(tools[0].parameters.properties.artifact.properties.name.pattern).toBeUndefined();
    expect(tools[0].parameters.properties.artifact.properties.slug.pattern).toBe(validPattern);
    expect(tools[0].parameters.properties.pattern.pattern).toBe(validPattern);
    expect(tools[0].parameters.allOf[0].properties.title.pattern).toBeUndefined();
    // Copy-on-write: the caller's schema remains available for another provider.
    expect(sourceParameters.properties.artifact.properties.name.pattern).toBe(unicodePattern);
  });

  it("keeps escaped literal property text and schema identity when no strip is needed", () => {
    const parameters = {
      type: "object",
      properties: {
        literal: { type: "string", pattern: "^\\\\p{Cc}$" },
        simple: { type: "string", pattern: "^[A-Z]+$" },
      },
    };
    const tools = normalizeTools([{ type: "function", name: "probe", parameters }]);

    expect(tools[0].parameters).toBe(parameters);
    expect(tools[0].parameters.properties.literal.pattern).toBe("^\\\\p{Cc}$");
  });

  it("sanitizes nested namespace function schemas", () => {
    const tools = normalizeTools([{
      type: "namespace",
      name: "agent",
      tools: [{
        type: "function",
        name: "Artifact",
        parameters: {
          type: "object",
          properties: { name: { type: "string", pattern: "^\\p{Cc}+$" } },
        },
      }],
    }]);

    expect(tools[0].tools[0].parameters.properties.name.pattern).toBeUndefined();
  });

  it("preserves custom freeform tools with format payloads", () => {
    const tools = normalizeTools([
      {
        type: "custom",
        name: "apply_patch",
        description: "patch",
        format: { type: "grammar", syntax: "lark", definition: "start: /.+/" },
      },
    ]);

    expect(tools).toEqual([
      {
        type: "custom",
        name: "apply_patch",
        description: "patch",
        format: { type: "grammar", syntax: "lark", definition: "start: /.+/" },
      },
    ]);
  });
  it.each(["properties", "patternProperties", "$defs", "definitions", "dependentSchemas", "dependencies"])("preserves names in %s schema maps", (keyword) => {
    const literal = { uniqueItems: true, pattern: "\\p{L}" };
    const entries = JSON.parse('{"uniqueItems":{},"pattern":{},"__proto__":{}}');
    for (const name of Object.keys(entries)) {
      entries[name] = { type: "array", uniqueItems: false, items: { type: "string", pattern: "\\p{L}" }, default: literal };
    }
    const source = { [keyword]: entries };
    const stats = { removed: 0 };
    const cleaned = stripCodexUnsupportedPatterns(source, stats);
    expect(Object.keys(cleaned[keyword])).toEqual(Object.keys(entries));
    for (const name of Object.keys(entries)) {
      expect(cleaned[keyword][name]).toEqual({ type: "array", items: { type: "string" }, default: literal });
      expect(cleaned[keyword][name].default).toBe(literal);
      expect(entries[name].uniqueItems).toBe(false);
    }
    expect(stats.removed).toBe(6);
  });

  it.each([
    "items", "prefixItems", "additionalItems", "contains", "additionalProperties",
    "unevaluatedItems", "unevaluatedProperties", "propertyNames", "allOf", "anyOf",
    "oneOf", "not", "if", "then", "else", "contentSchema",
  ])("sanitizes nested %s schemas without mutating their source", (keyword) => {
    const child = { type: "array", uniqueItems: true };
    const array = ["prefixItems", "allOf", "anyOf", "oneOf"].includes(keyword);
    const source = { [keyword]: array ? [child, true] : child };
    const cleaned = stripCodexUnsupportedPatterns(source);
    expect(cleaned[keyword]).toEqual(array ? [{ type: "array" }, true] : { type: "array" });
    expect(child.uniqueItems).toBe(true);
  });

  it("preserves literal annotations, supported constraints and unchanged branch identity", () => {
    const literal = { uniqueItems: true, pattern: "\\p{L}", properties: { uniqueItems: false } };
    const unchanged = { type: "string", pattern: "^[a-z]+$" };
    const source = {
      const: literal, default: literal, enum: [literal], examples: [literal], "x-data": literal,
      required: ["uniqueItems", "pattern"],
      properties: { unchanged, changed: { type: "array", uniqueItems: false } },
    };
    const cleaned = stripCodexUnsupportedPatterns(source);
    expect(cleaned.properties.changed).toEqual({ type: "array" });
    expect(cleaned.properties.unchanged).toBe(unchanged);
    for (const key of ["const", "default", "enum", "examples", "x-data", "required"]) {
      expect(cleaned[key]).toBe(source[key]);
    }
    expect(stripCodexUnsupportedPatterns(cleaned)).toBe(cleaned);
  });

  it("strips uniqueItems through flat, nested and namespace tool normalization", () => {
    const parameters = { type: "object", properties: { uniqueItems: { type: "array", uniqueItems: true } } };
    const tools = normalizeTools([
      { type: "function", name: "flat", parameters },
      { type: "function", function: { name: "nested", parameters } },
      { type: "namespace", name: "ns", tools: [{ type: "function", name: "child", parameters }] },
    ]);
    const expected = { type: "object", properties: { uniqueItems: { type: "array" } } };
    expect(tools[0].parameters).toEqual(expected);
    expect(tools[1].parameters).toEqual(expected);
    expect(tools[2].tools[0].parameters).toEqual(expected);
    expect(parameters.properties.uniqueItems.uniqueItems).toBe(true);
  });
});
