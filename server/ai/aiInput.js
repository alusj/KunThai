// KAI — input validation and minimisation.
//
// Two jobs:
//   1. Reject malformed or oversized requests before any token is spent.
//   2. Send Gemini the least data that can still answer the question. Anything
//      that looks like a credential or a raw contact detail is stripped here,
//      not in the prompt, so no task can leak it by accident.

import { LIMITS } from "./aiConfig.js";
import { AI_ERROR_CODES, aiError } from "./aiErrors.js";

// Control characters (except tab/newline) are removed: they carry no meaning
// for the model and are a cheap way to smuggle formatting into a prompt.
export function stripControlCharacters(value) {
  return Array.from(String(value ?? ""))
    .filter((character) => {
      const code = character.charCodeAt(0);
      if (code === 9 || code === 10) return true;
      return code > 31 && code !== 127;
    })
    .join("");
}

// Patterns that must never reach a third-party model even if a caller puts
// them in a text field. Redacted rather than rejected so the user's sentence
// still makes sense.
const SECRET_PATTERNS = [
  // Bearer / JWT style tokens.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g, "[removed]"],
  // Supabase, Google, Stripe, generic long API keys.
  [/\b(?:sb[pq]_|sk_live_|sk_test_|pk_live_|AIza)[A-Za-z0-9_-]{12,}\b/g, "[removed]"],
  // "password: hunter2", "api key = ...".
  [/\b(?:password|passcode|api[ _-]?key|secret|access[ _-]?token|otp|pin)\s*[:=]\s*\S+/gi, "[removed]"],
  // Long card-like digit runs.
  [/\b(?:\d[ -]?){13,19}\b/g, "[removed]"],
];

export function redactSecrets(value) {
  return SECRET_PATTERNS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    String(value ?? ""),
  );
}

// Free text destined for a prompt: control characters out, secrets redacted,
// length capped.
export function cleanText(value, maxChars = LIMITS.maxTextChars) {
  return redactSecrets(stripControlCharacters(value)).trim().slice(0, Math.max(1, maxChars));
}

// Short single-line values (ids, tones, language codes, titles).
export function cleanLine(value, maxChars = 200) {
  return cleanText(value, maxChars).replace(/\s+/g, " ").trim();
}

export function cleanSlug(value, maxChars = 64) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, maxChars);
}

export function cleanList(value, { maxItems = LIMITS.maxListItems, maxItemChars = LIMITS.maxListItemChars } = {}) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxItems)
    .map((item) => cleanText(item, maxItemChars))
    .filter(Boolean);
}

// Conversation history is deliberately trimmed from the END (most recent kept)
// and then capped by total characters. Resending a whole chat is the single
// biggest avoidable cost in an assistant.
export function cleanHistory(value) {
  if (!Array.isArray(value)) return [];

  const turns = value
    .slice(-LIMITS.maxHistoryTurns)
    .map((turn) => ({
      role: turn?.role === "model" || turn?.role === "assistant" ? "model" : "user",
      text: cleanText(turn?.text ?? turn?.content, 1_500),
    }))
    .filter((turn) => turn.text);

  let budget = LIMITS.maxHistoryChars;
  const kept = [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    budget -= turns[index].text.length;
    if (budget < 0) break;
    kept.unshift(turns[index]);
  }
  return kept;
}

export function requireText(value, field, { min = 1, max = LIMITS.maxTextChars } = {}) {
  const text = cleanText(value, max);
  if (text.length < min) {
    throw aiError(AI_ERROR_CODES.invalidRequest, {
      message: `Add some ${field} for KAI to work with.`,
      details: `missing-${field}`,
    });
  }
  return text;
}

export function optionalChoice(value, choices, fallback = "") {
  const candidate = cleanSlug(value, 40);
  return choices.includes(candidate) ? candidate : fallback;
}

// Language is passed to the model as a label, so only well-formed BCP-47-ish
// codes are accepted.
export function cleanLanguage(value, fallback = "") {
  const code = String(value ?? "").trim().toLowerCase().replace(/_/g, "-");
  return /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(code) ? code : fallback;
}

export function assertBodySize(req, maxBytes) {
  const declared = Number(req?.headers?.["content-length"] || 0);
  if (declared > maxBytes) {
    throw aiError(AI_ERROR_CODES.payloadTooLarge, { details: `content-length-${declared}` });
  }
}

// Rough token estimate used only for pre-flight budget decisions and logging.
// Gemini bills on its own count; this never replaces usageMetadata.
export function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Validate an image supplied as a data URL and return Gemini inline data.
 *
 * Only small raster images are accepted. The mime type is checked against the
 * decoded bytes' magic numbers, not just the declared prefix, so a renamed file
 * cannot pass as a photo.
 */
export function cleanImageDataUrl(value, { maxBytes = LIMITS.maxImageBytes } = {}) {
  const match = String(value || "").match(/^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;

  const [, mimeType, data] = match;
  if (!IMAGE_MIME_TYPES.has(mimeType)) return null;

  const bytes = Buffer.from(data, "base64");
  if (!bytes.length) return null;
  if (bytes.length > maxBytes) {
    throw aiError(AI_ERROR_CODES.payloadTooLarge, {
      message: "That photo is too large for KAI. Please try a smaller one.",
      details: `image-${bytes.length}`,
    });
  }

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isWebp = bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  const actual = isJpeg ? "image/jpeg" : isPng ? "image/png" : isWebp ? "image/webp" : "";
  if (!actual) return null;

  return { mimeType: actual, data };
}
