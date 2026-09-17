// KAI — the Gemini client.
//
// The only module in the codebase that talks to Google. It owns the API key,
// the timeout, the retry policy and the tier fallback, so every KunThai feature
// inherits the same behaviour under load.
//
// SERVER ONLY. Importing this from `src/` would put the key path into the
// browser bundle.

import { GoogleGenAI } from "@google/genai";

import { RETRY, estimateCostMicros, getApiKey, getModelTier, isAiConfigured } from "./aiConfig.js";
import { AI_ERROR_CODES, AiError, aiError, fromProviderError } from "./aiErrors.js";

let cachedClient = null;
let cachedKey = "";

function getClient() {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw aiError(AI_ERROR_CODES.aiUnavailable, { details: "missing-api-key" });
  }
  // Reused across warm invocations; rebuilt only if the key is rotated.
  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new GoogleGenAI({ apiKey });
    cachedKey = apiKey;
  }
  return cachedClient;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Gemini 3.x models think by default. Measured against this project's key: a
// one-line caption rewrite burned 189 thought tokens for no quality gain, so
// tasks opt IN to thinking rather than out of it.
//
// The control is `thinkingLevel`, not `thinkingBudget` — verified 2026-09-16:
// gemini-3.5-flash-lite answers 400 INVALID_ARGUMENT to a thinkingBudget, and
// "minimal" produces zero thought tokens on both the lite and full models.
// A tier that wants reasoning sends nothing and takes the model's own default.
function thinkingConfigFor(tier) {
  return tier.thinking === "on" ? undefined : { thinkingLevel: "minimal" };
}

function readUsage(response, model) {
  const usage = response?.usageMetadata || {};
  const inputTokens = Number(usage.promptTokenCount || 0);
  const outputTokens = Number(usage.candidatesTokenCount || 0) + Number(usage.thoughtsTokenCount || 0);
  return {
    model,
    inputTokens,
    outputTokens,
    thoughtTokens: Number(usage.thoughtsTokenCount || 0),
    cachedTokens: Number(usage.cachedContentTokenCount || 0),
    totalTokens: Number(usage.totalTokenCount || inputTokens + outputTokens),
    costMicros: estimateCostMicros({ model, inputTokens, outputTokens }),
  };
}

// The model is asked for bare JSON through responseSchema, but a stray code
// fence still shows up occasionally. Recover rather than fail the request.
export function parseJsonResponse(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    throw aiError(AI_ERROR_CODES.emptyResponse, { details: "empty-json" });
  }

  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(unfenced.slice(start, end + 1));
      } catch {
        // Falls through to the shared error below.
      }
    }
    throw aiError(AI_ERROR_CODES.emptyResponse, { details: "unparsable-json" });
  }
}

// A text-only request sends the prompt string as-is. When a task supplies media
// (a validated, downscaled photo) the prompt and images travel as parts of one
// user turn.
function buildContents(prompt, media) {
  if (!Array.isArray(media) || !media.length) return prompt;
  return [
    {
      role: "user",
      parts: [{ text: prompt }, ...media.map((item) => ({ inlineData: { mimeType: item.mimeType, data: item.data } }))],
    },
  ];
}

async function callGemini({
  tier,
  systemInstruction,
  prompt,
  media,
  contents,
  schema,
  tools,
  toolConfig,
  allowToolCalls = false,
  maxOutputTokens,
  temperature,
  signal,
  thinkingConfig,
}) {
  const controller = new AbortController();
  // A caller-side cancel (the user pressed Stop) aborts the wait immediately.
  const forwardAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", forwardAbort, { once: true });
  }

  const timer = setTimeout(() => controller.abort(), tier.timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await getClient().models.generateContent({
      model: tier.model,
      contents: contents || buildContents(prompt, media),
      config: {
        systemInstruction,
        temperature: typeof temperature === "number" ? temperature : tier.temperature,
        maxOutputTokens: maxOutputTokens || tier.maxOutputTokens,
        abortSignal: controller.signal,
        thinkingConfig,
        ...(schema ? { responseMimeType: "application/json", responseSchema: schema } : {}),
        ...(tools ? { tools } : {}),
        ...(toolConfig ? { toolConfig } : {}),
      },
    });

    const candidateContent = response?.candidates?.[0]?.content || null;
    const functionCalls = allowToolCalls && Array.isArray(response?.functionCalls) ? response.functionCalls : [];
    // Reading .text on a tool-call response logs an SDK warning, so only read
    // it from the text parts directly.
    const text = (candidateContent?.parts || [])
      .filter((part) => typeof part.text === "string" && !part.thought)
      .map((part) => part.text)
      .join("");

    if (!String(text).trim() && !functionCalls.length) {
      throw aiError(AI_ERROR_CODES.emptyResponse, { details: "no-text" });
    }

    return {
      text: String(text),
      functionCalls,
      content: candidateContent,
      usage: readUsage(response, tier.model),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", forwardAbort);
  }
}

// Retry only faults that a second attempt can actually fix. A rejected prompt
// or a bad request is returned immediately rather than billed twice.
function shouldRetry(error) {
  return (
    error?.code === AI_ERROR_CODES.providerUnavailable ||
    error?.code === AI_ERROR_CODES.emptyResponse ||
    error?.code === AI_ERROR_CODES.rateLimited
  );
}

// Shared timeout / retry / tier-fallback policy for every kind of call.
async function runWithPolicy({ tierId, signal, allowFallback = true }, attemptCall) {
  if (!isAiConfigured()) {
    throw aiError(AI_ERROR_CODES.aiUnavailable, { details: "ai-disabled" });
  }

  const tiers = [getModelTier(tierId)];
  const fallbackId = tiers[0].fallbackTier;
  if (allowFallback && fallbackId) tiers.push(getModelTier(fallbackId));

  let attempts = 0;
  let lastError = null;

  for (let tierIndex = 0; tierIndex < tiers.length; tierIndex += 1) {
    const tier = tiers[tierIndex];

    for (let attempt = 0; attempt < Math.max(1, RETRY.attempts); attempt += 1) {
      if (signal?.aborted) throw aiError(AI_ERROR_CODES.timeout, { details: "client-cancelled" });
      attempts += 1;

      try {
        let result;
        try {
          result = await attemptCall(tier, thinkingConfigFor(tier));
        } catch (thinkingError) {
          // Thinking controls are the one config field whose spelling has moved
          // between Gemini generations. If a model rejects the one we sent,
          // fall back to its own default rather than failing the person's
          // request — an operator can point a tier at any model id.
          // instanceof, not a truthy .code: a DOMException abort carries a
          // numeric code (20) and must still be mapped to a timeout.
          const mapped = thinkingError instanceof AiError ? thinkingError : fromProviderError(thinkingError);
          if (mapped.code !== AI_ERROR_CODES.providerRejected || tier.thinking === "on") throw mapped;
          console.warn(`[KAI] ${tier.model} rejected the thinking control; retrying with its default`);
          result = await attemptCall(tier, undefined);
        }
        return {
          ...result,
          model: tier.model,
          tier: tier.id,
          attempts,
          degraded: tierIndex > 0,
        };
      } catch (error) {
        lastError = error instanceof AiError ? error : fromProviderError(error);
        if (!shouldRetry(lastError)) throw lastError;
        // Exponential-ish backoff, kept short: the caller is a person waiting.
        if (attempt + 1 < Math.max(1, RETRY.attempts)) {
          await delay(RETRY.baseDelayMs * (attempt + 1));
        }
      }
    }
  }

  throw lastError || aiError(AI_ERROR_CODES.serverError, { details: "exhausted" });
}

/**
 * Run one Gemini generation with timeout, bounded retries and tier fallback.
 *
 * Returns { text, usage, durationMs, model, tier, attempts, degraded }.
 * `degraded` is true when the answer came from the fallback tier, which the UI
 * may surface but must never treat as a failure.
 */
export async function generateWithGemini({
  tierId = "standard",
  systemInstruction,
  prompt,
  media = null,
  schema = null,
  maxOutputTokens = 0,
  temperature,
  signal,
} = {}) {
  if (!isAiConfigured()) {
    throw aiError(AI_ERROR_CODES.aiUnavailable, { details: "ai-disabled" });
  }
  if (!String(prompt || "").trim()) {
    throw aiError(AI_ERROR_CODES.invalidRequest, { details: "empty-prompt" });
  }

  return runWithPolicy({ tierId, signal }, (tier, thinkingConfig) =>
    callGemini({ tier, systemInstruction, prompt, media, schema, maxOutputTokens, temperature, signal, thinkingConfig }),
  );
}

/**
 * One assistant turn with function declarations.
 *
 * Returns the same envelope as generateWithGemini plus `functionCalls` and the
 * raw candidate `content` (which carries Gemini 3's thought signatures and
 * must be replayed verbatim on the next turn).
 *
 * `forceText` sets function-calling mode NONE so the model has to answer in
 * words — used on the last permitted round so a model that keeps asking for
 * the same tool cannot loop.
 */
export async function generateAssistantTurn({
  tierId = "fast",
  systemInstruction,
  contents,
  tools,
  forceText = false,
  maxOutputTokens = 0,
  temperature,
  signal,
} = {}) {
  if (!Array.isArray(contents) || !contents.length) {
    throw aiError(AI_ERROR_CODES.invalidRequest, { details: "empty-contents" });
  }

  // No tier fallback mid-conversation: thought signatures are tied to the model
  // that produced them, so a turn must be continued by the same model.
  return runWithPolicy({ tierId, signal, allowFallback: false }, (tier, thinkingConfig) =>
    callGemini({
      tier,
      systemInstruction,
      contents,
      tools,
      toolConfig: forceText ? { functionCallingConfig: { mode: "NONE" } } : undefined,
      allowToolCalls: !forceText,
      maxOutputTokens,
      temperature,
      signal,
      thinkingConfig,
    }),
  );
}

export { buildContents, readUsage, thinkingConfigFor };
