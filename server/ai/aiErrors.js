// KAI — structured errors.
//
// Every failure path produces one of these so the browser always receives a
// stable machine code plus a sentence a real person can read, and so nothing
// from the provider (keys, prompts, stack traces) is ever echoed back.

export const AI_ERROR_CODES = {
  aiUnavailable: "ai_unavailable",
  notAuthenticated: "not_authenticated",
  guestBlocked: "guest_blocked",
  forbidden: "forbidden",
  invalidRequest: "invalid_request",
  payloadTooLarge: "payload_too_large",
  unknownTask: "unknown_task",
  rateLimited: "rate_limited",
  budgetExceeded: "budget_exceeded",
  // Everyone's combined daily spend reached the owner's ceiling.
  aiResting: "ai_resting",
  timeout: "timeout",
  providerUnavailable: "provider_unavailable",
  providerRejected: "provider_rejected",
  emptyResponse: "empty_response",
  serverError: "server_error",
};

const STATUS_BY_CODE = {
  [AI_ERROR_CODES.aiUnavailable]: 503,
  [AI_ERROR_CODES.notAuthenticated]: 401,
  [AI_ERROR_CODES.guestBlocked]: 401,
  [AI_ERROR_CODES.forbidden]: 403,
  [AI_ERROR_CODES.invalidRequest]: 400,
  [AI_ERROR_CODES.payloadTooLarge]: 413,
  [AI_ERROR_CODES.unknownTask]: 400,
  [AI_ERROR_CODES.rateLimited]: 429,
  [AI_ERROR_CODES.budgetExceeded]: 429,
  [AI_ERROR_CODES.aiResting]: 503,
  [AI_ERROR_CODES.timeout]: 504,
  [AI_ERROR_CODES.providerUnavailable]: 503,
  [AI_ERROR_CODES.providerRejected]: 422,
  [AI_ERROR_CODES.emptyResponse]: 502,
  [AI_ERROR_CODES.serverError]: 500,
};

const MESSAGE_BY_CODE = {
  [AI_ERROR_CODES.aiUnavailable]: "KAI is not available right now.",
  [AI_ERROR_CODES.notAuthenticated]: "Sign in to use KAI.",
  [AI_ERROR_CODES.guestBlocked]: "Create a KunThai account to use KAI.",
  [AI_ERROR_CODES.forbidden]: "This KAI action is not available for your account.",
  [AI_ERROR_CODES.invalidRequest]: "KAI could not read that request.",
  [AI_ERROR_CODES.payloadTooLarge]: "That is too much text for KAI. Please shorten it and try again.",
  [AI_ERROR_CODES.unknownTask]: "That KAI action is not available.",
  [AI_ERROR_CODES.rateLimited]: "You have used KAI several times in a row. Please wait a moment and try again.",
  [AI_ERROR_CODES.budgetExceeded]: "You have reached today's KAI limit. Please try again tomorrow.",
  [AI_ERROR_CODES.aiResting]: "KAI is resting for a while. Please try again later.",
  [AI_ERROR_CODES.timeout]: "KAI took too long to answer. Please try again.",
  [AI_ERROR_CODES.providerUnavailable]: "KAI is busy right now. Please try again in a moment.",
  [AI_ERROR_CODES.providerRejected]: "KAI could not answer that request safely.",
  [AI_ERROR_CODES.emptyResponse]: "KAI did not return an answer. Please try again.",
  [AI_ERROR_CODES.serverError]: "KAI ran into a problem. Please try again.",
};

export class AiError extends Error {
  constructor(code, { message = "", status = 0, retryAfterSeconds = 0, details = "" } = {}) {
    const safeCode = MESSAGE_BY_CODE[code] ? code : AI_ERROR_CODES.serverError;
    super(message || MESSAGE_BY_CODE[safeCode]);
    this.name = "AiError";
    this.code = safeCode;
    this.status = status || STATUS_BY_CODE[safeCode] || 500;
    this.retryAfterSeconds = Math.max(0, Math.round(Number(retryAfterSeconds) || 0));
    // Short, non-sensitive hint kept for server logs only. Never sent back.
    this.details = String(details || "").slice(0, 300);
  }
}

export function aiError(code, options) {
  return new AiError(code, options);
}

export function isRetryableCode(code) {
  return (
    code === AI_ERROR_CODES.providerUnavailable ||
    code === AI_ERROR_CODES.timeout ||
    code === AI_ERROR_CODES.emptyResponse
  );
}

// Translate a raw @google/genai / fetch failure into a KunThai error without
// leaking the provider payload (which can contain the request, and in some
// error shapes the API key in a URL).
export function fromProviderError(error) {
  if (error instanceof AiError) return error;

  const status = Number(error?.status || error?.code || 0);
  const name = String(error?.name || "");
  const raw = String(error?.message || "");

  if (name === "AbortError" || /abort/i.test(name)) {
    return aiError(AI_ERROR_CODES.timeout, { details: "aborted" });
  }
  if (status === 429) {
    return aiError(AI_ERROR_CODES.rateLimited, {
      message: "KAI is handling many requests. Please try again shortly.",
      retryAfterSeconds: 20,
      details: "provider-429",
    });
  }
  if (status === 400 || status === 422) {
    return aiError(AI_ERROR_CODES.providerRejected, { details: `provider-${status}` });
  }
  if (status === 401 || status === 403) {
    // A bad or revoked key is an operator problem, never a user problem.
    return aiError(AI_ERROR_CODES.aiUnavailable, { details: `provider-auth-${status}` });
  }
  if (status === 404) {
    return aiError(AI_ERROR_CODES.aiUnavailable, { details: "provider-model-missing" });
  }
  if (status >= 500 || /unavailable|overloaded|high demand/i.test(raw)) {
    return aiError(AI_ERROR_CODES.providerUnavailable, { retryAfterSeconds: 10, details: `provider-${status || "5xx"}` });
  }
  if (/fetch failed|network|econn|socket/i.test(raw)) {
    return aiError(AI_ERROR_CODES.providerUnavailable, { retryAfterSeconds: 10, details: "provider-network" });
  }

  return aiError(AI_ERROR_CODES.serverError, { details: `unmapped-${status || name || "error"}` });
}

// One place decides what the browser is allowed to see.
export function toClientError(error) {
  const known = error instanceof AiError ? error : fromProviderError(error);
  return {
    ok: false,
    code: known.code,
    message: known.message,
    ...(known.retryAfterSeconds ? { retryAfterSeconds: known.retryAfterSeconds } : {}),
  };
}

// Server logging: code + short hint only, never the prompt or the payload.
export function logAiError(scope, error) {
  const known = error instanceof AiError ? error : fromProviderError(error);
  console.error(`[KAI] ${scope} ${known.code}${known.details ? ` (${known.details})` : ""}`);
  return known;
}
