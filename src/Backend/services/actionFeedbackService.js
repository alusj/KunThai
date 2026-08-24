import { showToast } from "./toastService";
import { haptics } from "./feedbackService";
import { friendlyErrorMessage } from "./friendlyErrorService";

// One call to acknowledge a completed user action so nothing ever finishes
// silently: a plain-language toast plus a short haptic tick. `module` maps to
// the per-surface feedback settings ("explore" | "marketplace" | "transport").
// Both channels are best-effort — the underlying services already swallow their
// own errors, so feedback can never break or slow the action that triggered it.
export function notifyActionDone(message, { module = "explore", tone = "success", haptic = "light" } = {}) {
  if (message) showToast(message, tone);
  if (haptic && typeof haptics[haptic] === "function") haptics[haptic](module);
}

// The failure counterpart: a friendly (network/technical-sanitized) toast plus a
// firmer haptic, so a failed action is just as clearly acknowledged.
export function notifyActionFailed(error, fallback = "", { module = "explore" } = {}) {
  showToast(friendlyErrorMessage(error, fallback), "danger");
  if (typeof haptics.heavy === "function") haptics.heavy(module);
}
