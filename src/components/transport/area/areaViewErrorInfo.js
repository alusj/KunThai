// What the Nearby Area error card shows and keeps about a failure, so the
// owner can screenshot or copy it and it can be read back after a reload.
export const AREA_VIEW_LAST_ERROR_KEY = "kt-area-view-last-error";
const ERROR_DETAILS_MAX = 160;

// "TypeError: null is not an object (evaluating 'a.label')", one line, at most
// 160 characters.
export function describeAreaViewError(error) {
  const name = String(error?.name || "Error");
  const message = String(error?.message || (typeof error === "string" ? error : "")).replace(/\s+/g, " ").trim();
  const text = message ? `${name}: ${message}` : name;
  return text.length > ERROR_DETAILS_MAX ? `${text.slice(0, ERROR_DETAILS_MAX - 1)}…` : text;
}

export function rememberAreaViewError(error, failures, storage = globalThis.sessionStorage) {
  try {
    storage?.setItem(
      AREA_VIEW_LAST_ERROR_KEY,
      JSON.stringify({
        name: String(error?.name || "Error"),
        message: String(error?.message || (typeof error === "string" ? error : "")),
        stack: String(error?.stack || "").split("\n").slice(0, 6).join("\n"),
        failures,
        at: new Date().toISOString(),
        timestamp: Date.now(),
      }),
    );
    return true;
  } catch {
    // Storage can be blocked (private mode); the card still shows the details.
    return false;
  }
}
