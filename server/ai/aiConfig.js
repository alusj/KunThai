// KAI — central configuration.
//
// Everything that decides WHICH Gemini model runs, how long it may run, how
// much it may cost, and how often a person may ask lives in this one file, so
// tuning cost or safety is a single-file change rather than a hunt through
// endpoints.
//
// This module is server-only. It reads GEMINI_API_KEY and must never be
// imported from `src/` (Vite would bundle the secret path into the browser).

const TRUTHY = new Set(["1", "true", "yes", "on"]);

function readEnv(name, fallback = "") {
  const value = process.env[name];
  return value === undefined || value === null || value === "" ? fallback : String(value).trim();
}

function readNumber(name, fallback) {
  const value = Number(readEnv(name, ""));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readFlag(name, fallback = false) {
  const value = readEnv(name, "");
  if (!value) return fallback;
  return TRUTHY.has(value.toLowerCase());
}

// The API key never leaves the server. `isAiConfigured()` is the single check
// every entry point uses so a missing key degrades to a clean "AI unavailable"
// response instead of a crash.
export function getApiKey() {
  return readEnv("GEMINI_API_KEY", "");
}

export function isAiConfigured() {
  return Boolean(getApiKey()) && readFlag("KUNTHAI_AI_ENABLED", true);
}

// --- Models -----------------------------------------------------------------
//
// Three tiers, cheapest first. Tasks pick a tier, never a raw model id, so the
// whole platform can move to a new Gemini release by changing this map (or the
// matching environment variable) once.
//
// Verified live against the KunThai key on 2026-09-16: the Gemini 2.5 family
// now returns 404 ("no longer available to new users"), so the defaults below
// are the 3.5 family. `thinking: "off"` sets thinkingBudget 0 — measured at 189
// wasted thought tokens per trivial rewrite when left on.
export const MODEL_TIERS = {
  fast: {
    id: "fast",
    model: readEnv("GEMINI_MODEL_FAST", "gemini-3.5-flash-lite"),
    thinking: "off",
    temperature: 0.4,
    maxOutputTokens: 640,
    timeoutMs: readNumber("AI_TIMEOUT_FAST_MS", 20_000),
    fallbackTier: "",
  },
  standard: {
    id: "standard",
    model: readEnv("GEMINI_MODEL_STANDARD", "gemini-3.5-flash"),
    thinking: "off",
    temperature: 0.5,
    maxOutputTokens: 1_400,
    timeoutMs: readNumber("AI_TIMEOUT_STANDARD_MS", 30_000),
    // A busy flash model answers 503; dropping to the lite tier keeps the
    // feature working instead of showing an error.
    fallbackTier: "fast",
  },
  reasoning: {
    id: "reasoning",
    model: readEnv("GEMINI_MODEL_REASONING", "gemini-3.5-flash"),
    thinking: "on",
    temperature: 0.4,
    maxOutputTokens: 2_400,
    timeoutMs: readNumber("AI_TIMEOUT_REASONING_MS", 45_000),
    fallbackTier: "standard",
  },
};

export function getModelTier(tierId) {
  return MODEL_TIERS[tierId] || MODEL_TIERS.standard;
}

// --- Cost awareness ---------------------------------------------------------
//
// USD price per 1,000,000 tokens. These are estimates used for KunThai's own
// spend tracking and budget guards — they are not billing figures. Override
// them with AI_PRICE_<MODEL>_INPUT / _OUTPUT (dots and dashes become
// underscores) whenever Google publishes new pricing.
const DEFAULT_PRICES = {
  "gemini-3.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-3.5-flash": { input: 0.3, output: 2.5 },
  "gemini-3.8-flash": { input: 0.3, output: 2.5 },
  "gemini-3.1-pro-preview": { input: 1.25, output: 10 },
};

const FALLBACK_PRICE = { input: 0.3, output: 2.5 };

export function getModelPrice(model) {
  const key = String(model || "").replace(/[.-]/g, "_").toUpperCase();
  const base = DEFAULT_PRICES[model] || FALLBACK_PRICE;
  return {
    input: Number(readEnv(`AI_PRICE_${key}_INPUT`, "")) || base.input,
    output: Number(readEnv(`AI_PRICE_${key}_OUTPUT`, "")) || base.output,
  };
}

// Cost is stored in micro-USD integers so a million cheap calls still sum
// exactly in Postgres without floating-point drift.
export function estimateCostMicros({ model, inputTokens = 0, outputTokens = 0 }) {
  const price = getModelPrice(model);
  const inputCost = (Number(inputTokens) || 0) * price.input;
  const outputCost = (Number(outputTokens) || 0) * price.output;
  // (tokens * USD per 1e6 tokens) => USD; * 1e6 => micro-USD.
  return Math.round(inputCost + outputCost);
}

// --- Request limits ---------------------------------------------------------
export const LIMITS = {
  // Hard ceiling on the raw request body before anything is parsed.
  // Sized for one downscaled photo (see maxImageBytes) plus text. Text fields
  // are still capped individually below, so a text-only request cannot use
  // this headroom to smuggle a huge prompt.
  maxBodyBytes: readNumber("AI_MAX_BODY_BYTES", 640_000),
  // Decoded size of one image sent for captioning. The browser downsizes to
  // ~512px JPEG first (typically 30-80 KB), so this is a ceiling, not a target.
  maxImageBytes: readNumber("AI_MAX_IMAGE_BYTES", 420_000),
  // Longest single text field a task may receive.
  maxTextChars: readNumber("AI_MAX_TEXT_CHARS", 8_000),
  // Longest list a task may receive (comments to summarise, products to rank).
  maxListItems: readNumber("AI_MAX_LIST_ITEMS", 40),
  maxListItemChars: readNumber("AI_MAX_LIST_ITEM_CHARS", 1_200),
  // Conversation turns kept when a task carries history. Deliberately small:
  // resending long histories is the most common way an assistant gets
  // expensive for no added quality.
  maxHistoryTurns: readNumber("AI_MAX_HISTORY_TURNS", 6),
  maxHistoryChars: readNumber("AI_MAX_HISTORY_CHARS", 4_000),
};

// Per-user request budgets. Checked in one round trip against ai_usage_events.
export const RATE_LIMITS = {
  perMinute: readNumber("AI_RATE_PER_MINUTE", 10),
  perHour: readNumber("AI_RATE_PER_HOUR", 80),
  perDay: readNumber("AI_RATE_PER_DAY", 250),
  // Spend guard: once a person's own estimated daily cost passes this, their
  // AI calls stop until the window rolls over.
  perDayCostMicros: readNumber("AI_DAILY_COST_MICROS", 400_000),
};

// Cached answers for identical, non-personal inputs (translations, tone
// rewrites). Saves both latency and tokens.
export const CACHE = {
  enabled: readFlag("AI_RESPONSE_CACHE_ENABLED", true),
  ttlSeconds: readNumber("AI_RESPONSE_CACHE_TTL_SECONDS", 60 * 60 * 24 * 7),
  memoryEntries: readNumber("AI_RESPONSE_CACHE_MEMORY_ENTRIES", 120),
};

export const RETRY = {
  attempts: readNumber("AI_RETRY_ATTEMPTS", 2),
  baseDelayMs: readNumber("AI_RETRY_BASE_DELAY_MS", 400),
};

// Surfaces the assistant understands. A request naming anything else is
// rejected before it reaches Gemini.
export const SURFACES = ["explore", "urmall", "urride", "admin", "global"];

export function isKnownSurface(surface) {
  return SURFACES.includes(String(surface || "").toLowerCase());
}

export { readEnv, readFlag, readNumber };
