import supabase from "../../lib/supabaseClient";
import { friendlyErrorMessage } from "../friendlyErrorService";
import { apiUrl } from "../../lib/apiUrl.js";
import { t } from "../../../i18n";
import { createRequestSharer, limitMessageKey } from "./aiRequestSharing.js";

// KAI — browser service.
//
// The browser never holds a Gemini key and never builds a prompt. It names a
// task, sends the data that task needs, and renders what comes back. Everything
// else (model choice, prompt, guardrails, rate limits, cost) lives behind
// /api/ai.

const AI_API_PATH = "/api/ai";
const STATUS_CACHE_KEY = "kunthai.ai.status.v1";
const STATUS_TTL_MS = 10 * 60 * 1000;

// Error codes the server can return. Mirrors server/ai/aiErrors.js so the UI
// can react (offer sign-in, show a wait, hide the feature) without string
// matching on messages.
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
  aiResting: "ai_resting",
  timeout: "timeout",
  providerUnavailable: "provider_unavailable",
  providerRejected: "provider_rejected",
  emptyResponse: "empty_response",
  serverError: "server_error",
};

export class AiRequestError extends Error {
  constructor(message, { code = AI_ERROR_CODES.serverError, retryAfterSeconds = 0 } = {}) {
    super(message);
    this.name = "AiRequestError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** True when the user can reasonably press "Try again" on this failure. */
export function isRetryableAiError(error) {
  return [
    AI_ERROR_CODES.timeout,
    AI_ERROR_CODES.providerUnavailable,
    AI_ERROR_CODES.emptyResponse,
    AI_ERROR_CODES.serverError,
  ].includes(error?.code);
}

/** Cancelling from the UI must never look like a failure. */
export function isAiCancellation(error) {
  return error?.name === "AbortError" || error?.code === "cancelled";
}

// --- Availability -----------------------------------------------------------

let statusPromise = null;
let statusValue = null;

function readStoredStatus() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(STATUS_CACHE_KEY) || "null");
    if (stored && Date.now() - Number(stored.savedAt || 0) < STATUS_TTL_MS) return stored.value;
  } catch {
    // Storage is optional; a fresh probe is the fallback.
  }
  return null;
}

function storeStatus(value) {
  statusValue = value;
  try {
    sessionStorage.setItem(STATUS_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // The in-memory copy still serves this page view.
  }
}

const UNAVAILABLE_STATUS = { available: false, tasks: [], surfaces: [], limits: {} };

/**
 * Ask the server whether AI is switched on and which tasks exist.
 *
 * Cached for the session: AI entry points across the app call this on mount and
 * must not each cost a request. A failure resolves to "unavailable" rather than
 * throwing, so a surface can simply hide its AI affordances.
 */
export async function getAiStatus() {
  if (statusValue) return statusValue;

  const stored = readStoredStatus();
  if (stored) {
    statusValue = stored;
    return stored;
  }

  if (!statusPromise) {
    statusPromise = (async () => {
      try {
        const response = await fetch(apiUrl(AI_API_PATH), { method: "GET", headers: { Accept: "application/json" } });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok) return UNAVAILABLE_STATUS;
        const value = {
          available: Boolean(data.available),
          tasks: Array.isArray(data.tasks) ? data.tasks : [],
          surfaces: Array.isArray(data.surfaces) ? data.surfaces : [],
          limits: data.limits && typeof data.limits === "object" ? data.limits : {},
        };
        storeStatus(value);
        return value;
      } catch {
        return UNAVAILABLE_STATUS;
      } finally {
        statusPromise = null;
      }
    })();
  }

  return statusPromise;
}

export function getCachedAiStatus() {
  return statusValue || readStoredStatus() || null;
}

export function resetAiStatusCache() {
  statusValue = null;
  statusPromise = null;
  try {
    sessionStorage.removeItem(STATUS_CACHE_KEY);
  } catch {
    // Nothing else to clear.
  }
}

// --- Running a task ---------------------------------------------------------

// Identical requests fired while one is still running (a double tap, a
// re-render, two components asking for the same summary, a Stop followed by the
// same request again) share one network call instead of two billed
// generations. Each caller keeps its own cancel: stopping only detaches that
// caller, because the server keeps generating (and billing) anyway.
const shareRequest = createRequestSharer();

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const accessToken = data?.session?.access_token;
  if (!accessToken) {
    throw new AiRequestError("Sign in to use KAI.", { code: AI_ERROR_CODES.notAuthenticated });
  }
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function postAi(body, signal) {
  const headers = await authHeaders();

  let response;
  try {
    response = await fetch(apiUrl(AI_API_PATH), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (networkError) {
    if (networkError?.name === "AbortError") throw networkError;
    throw new AiRequestError(friendlyErrorMessage(networkError, "KAI could not be reached. Check your connection and try again."), {
      code: AI_ERROR_CODES.providerUnavailable,
    });
  }

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    const code = data?.code || AI_ERROR_CODES.serverError;
    // Limit messages are shown in the person's own language.
    const limitKey = limitMessageKey(code);
    const translated = limitKey ? t(limitKey) : "";
    throw new AiRequestError((translated && translated !== limitKey ? translated : "") || data?.message || "KAI ran into a problem. Please try again.", {
      code,
      retryAfterSeconds: Number(data?.retryAfterSeconds || 0),
    });
  }

  return data;
}

/**
 * Run one server-defined AI task.
 *
 * @param {object} options
 * @param {string} options.task     Task id from the server catalogue.
 * @param {string} options.surface  explore | urmall | urride | admin | global.
 * @param {object} options.input    Task input (text, items, question, ...).
 * @param {object} [options.context]  { screen }.
 * @param {AbortSignal} [options.signal]  Cancels the wait when the user stops.
 * @returns {Promise<{result: object, meta: object, task: string}>}
 */
export async function runAiTask({ task, surface = "global", input = {}, context = {}, signal } = {}) {
  if (!task) throw new AiRequestError("No KAI action was chosen.", { code: AI_ERROR_CODES.invalidRequest });

  const body = { task, surface, input, context };
  return shareRequest(body, () => postAi(body), signal);
}

/** Record a thumbs up/down on a result. Never throws — feedback is optional. */
export async function sendAiFeedback({ usageId, rating, reason = "" } = {}) {
  if (!usageId) return false;
  try {
    const data = await postAi({ action: "feedback", usageId, rating, reason });
    return Boolean(data?.saved);
  } catch {
    return false;
  }
}
