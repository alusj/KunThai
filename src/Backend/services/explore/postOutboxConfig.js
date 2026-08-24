// Feature control for the post outbox.
//
// Default ON: a post that can't publish right now is kept and retried
// automatically instead of being discarded. This only changes the FAILURE path
// — a normal, online publish behaves exactly as before — so it is safe to have
// on by default. Users can turn it off from Explore settings; the choice is
// persisted in localStorage and wins over the default in either direction.
const DEFAULT_ENABLED = true;
const OVERRIDE_KEY = "kunthai.postOutbox";

export function isPostOutboxEnabled() {
  try {
    if (typeof localStorage !== "undefined") {
      const value = localStorage.getItem(OVERRIDE_KEY);
      if (value === "on") return true;
      if (value === "off") return false;
    }
  } catch {
    // Storage unavailable (private mode) — fall back to the default.
  }
  return DEFAULT_ENABLED;
}

export function setPostOutboxEnabled(enabled) {
  try {
    localStorage.setItem(OVERRIDE_KEY, enabled ? "on" : "off");
  } catch {
    // Best-effort; if storage is unavailable the default still applies.
  }
}
