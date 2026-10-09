// KAI — browser-side request sharing (pure, no imports, tested in Node).
//
// Every KAI request is billed on the server whether or not the browser still
// waits for it, so cancelling a request and sending the identical one again
// (a double tap, a Stop then Retry, a re-render) used to pay twice. Here
// identical requests in flight share one network call. Each caller keeps its
// own AbortSignal: aborting rejects only that caller's promise and never
// cancels the shared call another caller is waiting on.

const ABORT_MESSAGE = "Aborted";

function abortError() {
  if (typeof DOMException === "function") return new DOMException(ABORT_MESSAGE, "AbortError");
  const error = new Error(ABORT_MESSAGE);
  error.name = "AbortError";
  return error;
}

/** Stable key for a request body ("" when it cannot be serialised). */
export function requestShareKey(body) {
  try {
    return JSON.stringify(body) || "";
  } catch {
    return "";
  }
}

/**
 * Returns share(body, start, signal): runs start() once per identical body
 * while it is in flight, and resolves/rejects every caller with its outcome.
 */
export function createRequestSharer() {
  const inFlight = new Map();

  return function share(body, start, signal) {
    if (signal?.aborted) return Promise.reject(abortError());
    const key = requestShareKey(body);
    let shared = key ? inFlight.get(key) : null;
    if (!shared) {
      shared = Promise.resolve().then(start);
      if (key) {
        inFlight.set(key, shared);
        const clear = () => {
          if (inFlight.get(key) === shared) inFlight.delete(key);
        };
        shared.then(clear, clear);
      }
    }
    if (!signal) return shared;

    return new Promise((resolve, reject) => {
      const onAbort = () => reject(abortError());
      signal.addEventListener("abort", onAbort, { once: true });
      shared.then(
        (value) => {
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (error) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        },
      );
    });
  };
}

const LIMIT_MESSAGE_KEYS = {
  rate_limited: "kaiRegistrationFix.limit.rateLimited",
  budget_exceeded: "kaiRegistrationFix.limit.budgetExceeded",
  ai_resting: "kaiRegistrationFix.limit.resting",
};

/** Translation key for a limit error code, or "". */
export function limitMessageKey(code) {
  return LIMIT_MESSAGE_KEYS[String(code || "")] || "";
}
