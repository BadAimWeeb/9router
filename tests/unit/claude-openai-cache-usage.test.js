import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn().mockResolvedValue(undefined),
}));

import { FORMATS } from "../../open-sse/translator/formats.js";
import { claudeToOpenAIResponse } from "../../open-sse/translator/response/claude-to-openai.js";
import { createSSEStream } from "../../open-sse/utils/stream.js";
import { canonicalizeUsage } from "../../open-sse/utils/usageTracking.js";

const BUFFER = 2000;
const INPUT = 44;
const OUTPUT = 4;

function claudeEvents({ cacheRead = 0, cacheCreation = 0, stopReason = "end_turn" } = {}) {
  return [
    { type: "message_start", message: {
      id: "msg_cache", model: "claude-sonnet-5", role: "assistant", content: [],
      usage: { input_tokens: INPUT, output_tokens: 1, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheCreation },
    } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "OK" } },
    { type: "content_block_stop", index: 0 },
    // Real Anthropic deltas omit input/cache; they must survive from message_start.
    { type: "message_delta", delta: stopReason ? { stop_reason: stopReason } : {}, usage: { output_tokens: OUTPUT } },
    { type: "message_stop" },
  ];
}

async function runStream(events, { targetFormat = FORMATS.CLAUDE, sourceFormat = FORMATS.OPENAI, mode = "translate" } = {}) {
  const encoder = new TextEncoder();
  const input = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });
  const onStreamComplete = vi.fn();
  const output = input.pipeThrough(createSSEStream({
    mode, targetFormat, sourceFormat, provider: "test", model: "test-model", onStreamComplete,
  }));
  const reader = output.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  const chunks = text.split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice(6)));
  expect(onStreamComplete).toHaveBeenCalledTimes(1);
  return { chunks, rawUsage: onStreamComplete.mock.calls[0][1] };
}

for (const stopReason of ["end_turn", null]) {
  describe(`Claude -> OpenAI cache usage (${stopReason ? "message_delta" : "message_stop fallback"})`, () => {
    it.each([
      { cacheRead: 15271, cacheCreation: 0 },
      { cacheRead: 0, cacheCreation: 15271 },
      { cacheRead: 12000, cacheCreation: 300 },
      { cacheRead: 0, cacheCreation: 0 },
    ])("forwards reads=$cacheRead writes=$cacheCreation without changing raw stats", async ({ cacheRead, cacheCreation }) => {
      const { chunks, rawUsage } = await runStream(claudeEvents({ cacheRead, cacheCreation, stopReason }));
      const finished = chunks.filter((chunk) => chunk.choices?.[0]?.finish_reason);
      expect(finished).toHaveLength(1);
      const prompt = INPUT + cacheRead + cacheCreation;
      const details = {};
      if (cacheRead) details.cached_tokens = cacheRead;
      if (cacheCreation) details.cache_creation_tokens = cacheCreation;
      expect(finished[0].usage).toEqual({
        prompt_tokens: prompt + BUFFER,
        completion_tokens: OUTPUT,
        total_tokens: prompt + OUTPUT + BUFFER,
        ...(cacheRead || cacheCreation ? { prompt_tokens_details: details } : {}),
      });
      expect(rawUsage.prompt_tokens).toBe(INPUT);
      expect(rawUsage.input_tokens).toBe(INPUT);
      expect(rawUsage.completion_tokens).toBe(OUTPUT);
      expect(rawUsage.prompt_tokens_details).toBeUndefined();
      expect(rawUsage.cache_read_input_tokens || 0).toBe(cacheRead);
      expect(rawUsage.cache_creation_input_tokens || 0).toBe(cacheCreation);
      // The completion callback feeds storage/cost canonicalization: fold cache once, without buffer.
      expect(canonicalizeUsage(rawUsage)).toEqual({
        prompt_tokens: prompt, completion_tokens: OUTPUT, total_tokens: prompt + OUTPUT,
        cached_tokens: cacheRead, cache_creation_input_tokens: cacheCreation,
      });
    });
  });
}

it("uses the same unbuffered cache math in the standalone message_stop fallback", () => {
  const state = {};
  const chunks = claudeEvents({ cacheRead: 12000, cacheCreation: 300, stopReason: null })
    .flatMap((event) => claudeToOpenAIResponse(event, state) || []);
  expect(chunks.at(-1).usage).toEqual({
    prompt_tokens: INPUT + 12300, completion_tokens: OUTPUT, total_tokens: INPUT + 12300 + OUTPUT,
    prompt_tokens_details: { cached_tokens: 12000, cache_creation_tokens: 300 },
  });
});

it("leaves same-format Claude usage cache-exclusive and unbuffered", async () => {
  const events = claudeEvents({ cacheRead: 12000, cacheCreation: 300 });
  const { chunks, rawUsage } = await runStream(events, { sourceFormat: FORMATS.CLAUDE });
  expect(chunks).toEqual(events);
  expect(canonicalizeUsage(rawUsage).prompt_tokens).toBe(INPUT + 12300);
});

it("does not change native OpenAI cache-inclusive prompt usage", async () => {
  const usage = { prompt_tokens: 100, completion_tokens: OUTPUT, total_tokens: 104,
    prompt_tokens_details: { cached_tokens: 80 } };
  const { chunks, rawUsage } = await runStream([
    { id: "chatcmpl_cache", choices: [{ index: 0, delta: { content: "OK" }, finish_reason: "stop" }], usage },
  ], { targetFormat: FORMATS.OPENAI, mode: "passthrough" });
  expect(chunks[0].usage).toEqual({ ...usage, prompt_tokens: 100 + BUFFER, total_tokens: 104 + BUFFER, cached_tokens: 80 });
  expect(rawUsage.prompt_tokens).toBe(100);
  expect(canonicalizeUsage(rawUsage).cached_tokens).toBe(80);
});

it("keeps the Claude -> Responses pivot cache-inclusive and unbuffered", async () => {
  const { chunks, rawUsage } = await runStream(claudeEvents({ cacheRead: 12000, cacheCreation: 300 }), {
    sourceFormat: FORMATS.OPENAI_RESPONSES,
  });
  const completed = chunks.find((chunk) => chunk.type === "response.completed");
  expect(completed.response.usage).toEqual({
    input_tokens: INPUT + 12300, output_tokens: OUTPUT, total_tokens: INPUT + 12300 + OUTPUT,
    input_tokens_details: { cached_tokens: 12000 },
  });
  expect(canonicalizeUsage(rawUsage).prompt_tokens).toBe(INPUT + 12300);
});
