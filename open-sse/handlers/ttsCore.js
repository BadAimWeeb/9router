import { Buffer } from "node:buffer";
import { createErrorResult } from "../utils/error.js";
import { HTTP_STATUS } from "../config/runtimeConfig.js";
import { getTtsAdapter, synthesizeViaConfig } from "./ttsProviders/index.js";

// Re-export voice fetchers + voices APIs for backward compat with existing routes
export {
  VOICE_FETCHERS,
  fetchEdgeTtsVoices,
  fetchLocalDeviceVoices,
  fetchElevenLabsVoices,
} from "./ttsProviders/index.js";

// ── Response Formatter (DRY) ───────────────────────────────────
function createTtsResponse(base64Audio, format, responseFormat) {
  const audioBuffer = Buffer.from(base64Audio, "base64");

  // JSON format: return base64 encoded audio
  if (responseFormat === "json") {
    return {
      success: true,
      response: new Response(JSON.stringify({ audio: base64Audio, format }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }),
    };
  }

  // Binary format (default): return raw audio
  return {
    success: true,
    response: new Response(audioBuffer, {
      headers: {
        "Content-Type": `audio/${format}`,
        "Content-Length": String(audioBuffer.length),
        "Access-Control-Allow-Origin": "*",
      },
    }),
  };
}

// ── Core handler ───────────────────────────────────────────────
/**
 * Synthesize text to audio. Provider logic lives in `./ttsProviders/{id}.js`
 * or is dispatched generically via `ttsConfig.format`.
 *
 * @returns {Promise<{success, response, status?, error?}>}
 */
export async function handleTtsCore({ provider, model, input, credentials, responseFormat = "mp3", language, style, voice, signal, proxyOptions }) {
  if (typeof input !== "string" || !input.trim()) {
    return createErrorResult(HTTP_STATUS.BAD_REQUEST, "Missing required field: input");
  }

  try {
    if (provider === "codex") {
      if (model !== "speech") return createErrorResult(400, "Use model cx/speech for Codex TTS");
      if (!["wav", "json"].includes(responseFormat)) return createErrorResult(400, "Codex TTS supports wav or json only");
      if (language || style) return createErrorResult(400, "Codex TTS does not support language or style");
      if (Buffer.byteLength(`Vocalize only the following quoted data: ${JSON.stringify(input)}`) > 500) return createErrorResult(400, "Codex TTS input exceeds the 500-byte context limit");
      if (voice != null && !["arbor", "breeze", "cove", "ember", "juniper", "maple", "sol", "spruce", "vale"].includes(voice)) return createErrorResult(400, "Unsupported Codex voice");
      const { synthesizeCodexTts } = await import("./codexTts.js");
      const audio = await synthesizeCodexTts({ input, voice, credentials, signal, proxyOptions });
      return createTtsResponse(audio.toString("base64"), "wav", responseFormat);
    }
    // Special-case adapters (google-tts, edge-tts, local-device, elevenlabs, openai, openrouter, gemini, xiaomi-mimo)
    const adapter = getTtsAdapter(provider);
    if (adapter) {
      const result = await adapter.synthesize(input.trim(), model, credentials, responseFormat, { language, style, voice });
      // Adapter may return a full {success, response} (legacy) or {base64, format}
      if (result.success !== undefined) return result;
      return createTtsResponse(result.base64, result.format, responseFormat);
    }

    // Generic config-driven (hyperbolic, deepgram, nvidia, huggingface, inworld, cartesia, playht, coqui, tortoise, qwen, ...)
    const result = await synthesizeViaConfig(provider, input.trim(), model, credentials);
    if (result) return createTtsResponse(result.base64, result.format, responseFormat);

    return createErrorResult(HTTP_STATUS.BAD_REQUEST, `Provider '${provider}' does not support TTS via this route.`);
  } catch (err) {
    return createErrorResult(provider === "codex" ? (err.status || (signal?.aborted ? 504 : 502)) : HTTP_STATUS.BAD_GATEWAY, provider === "codex" ? "Codex speech synthesis failed" : (err.message || "TTS synthesis failed"));
  }
}
