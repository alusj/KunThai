import { lazy } from "react";

// Messages browsers use when a code-split chunk (a dynamically imported module
// or its CSS) fails to load — almost always a transient network drop.
const CHUNK_ERROR_RE =
  /chunk|dynamically imported module|failed to fetch|load failed|loading css chunk|importing a module script|module script failed/i;

export function isChunkLoadError(error) {
  return CHUNK_ERROR_RE.test(String(error?.message || error || ""));
}

// Resolves once the browser reports it is back online, or after `timeout` as a
// safety net. Resolves immediately when already online.
function waitForOnline(timeout = 15000) {
  if (typeof window === "undefined" || typeof navigator === "undefined" || navigator.onLine) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("online", done);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, timeout);
    window.addEventListener("online", done);
  });
}

// Retries a code-split import through transient network drops so a chunk load
// self-heals instead of surfacing an error. While offline it parks until the
// connection returns (the promise stays pending, so Suspense keeps showing its
// loading state), then retries with a gentle backoff. Non-chunk errors — real
// module bugs — reject immediately so they still surface.
export function retryImport(factory, { retries = 5, delay = 600 } = {}) {
  return new Promise((resolve, reject) => {
    let wait = delay;
    const attempt = (remaining) => {
      Promise.resolve()
        .then(factory)
        .then(resolve)
        .catch(async (error) => {
          if (!isChunkLoadError(error) || remaining <= 0) {
            reject(error);
            return;
          }
          await waitForOnline();
          window.setTimeout(() => attempt(remaining - 1), wait);
          wait = Math.min(Math.round(wait * 1.8), 5000);
        });
    };
    attempt(retries);
  });
}

export function lazyWithRetry(factory, options) {
  return lazy(() => retryImport(factory, options));
}
