import { isConnectionFailure, sanitizeUserMessage, TOAST_MAX_LENGTH, TOAST_MIN_LENGTH } from "./friendlyErrorService";
import { announceConnectionTrouble } from "./networkService";
import { hapticFiredSince, haptics } from "./feedbackService";
import { t } from "../../i18n/index";

// Every toast is 15–25 characters, spaces included. The copy is written to
// fit; this flags a new toast that does not, while developing. Interpolated
// values (names, counts) are measured as shown.
function warnIfToastLength(message) {
  try {
    if (!import.meta.env.DEV || typeof message !== "string") return;
  } catch {
    return;
  }
  if (message.length < TOAST_MIN_LENGTH || message.length > TOAST_MAX_LENGTH) {
    console.warn(`[toast] ${message.length} characters (keep toasts ${TOAST_MIN_LENGTH}–${TOAST_MAX_LENGTH}): "${message}"`);
  }
}

export const TOAST_EVENT = "kuntai-toast";

// The most recent pointer press, used to draw a small arrow on the toast that
// points back at the icon/button the action came from.
let lastPointerPress = null;
const recentToastKeys = new Map();
const TOAST_DEDUP_MS = 1500;

if (typeof window !== "undefined") {
  window.addEventListener(
    "pointerdown",
    (event) => {
      lastPointerPress = { x: event.clientX, y: event.clientY, at: Date.now() };
    },
    { capture: true, passive: true },
  );
}

function readToastOrigin() {
  if (!lastPointerPress) return null;
  if (Date.now() - lastPointerPress.at > 1500) return null;
  return { x: lastPointerPress.x, y: lastPointerPress.y };
}

// A toast the person caused gets a matching haptic (never a sound). A toast
// that arrives on its own (a background save finishing, a connection notice)
// stays silent: "caused" means they tapped something in the last few seconds.
const TOAST_HAPTIC_WINDOW_MS = 10000;
const TOAST_HAPTICS = {
  success: "success",
  danger: "error",
  error: "error",
  warning: "warning",
  info: "selection",
};

function toastHaptic(tone, options) {
  try {
    if (options.haptic === false) return;
    if (!lastPointerPress || Date.now() - lastPointerPress.at > TOAST_HAPTIC_WINDOW_MS) return;
    const kind = TOAST_HAPTICS[tone] || TOAST_HAPTICS.info;
    const shownAt = Date.now() - 400;
    // Wait a moment: when the action already gave its own haptic (before or
    // right after the toast), the toast does not buzz a second time.
    window.setTimeout(() => {
      if (hapticFiredSince(shownAt)) return;
      haptics[kind]?.(options.module);
    }, 120);
  } catch {
    // Feedback is best-effort only.
  }
}

export function showToast(rawMessage, tone = "info", options = {}) {
  if (!rawMessage) return;
  // A lost connection has one voice: the global network toast. An action that
  // failed offline re-shows that toast rather than adding its own beside it.
  // Without a global announcer (the admin console) it shows the same short line.
  if (typeof rawMessage === "string" && isConnectionFailure(rawMessage)) {
    if (announceConnectionTrouble()) return;
    rawMessage = t("common.offlineBanner");
  }
  // Never surface raw network/technical errors — rewrite them to plain language
  // before anything else (including dedup, so a burst of the same fault shows
  // one friendly toast rather than several cryptic ones).
  const message = sanitizeUserMessage(rawMessage);
  if (!message) return;
  // Raw runtime noise becomes the long inline "something went wrong" line;
  // a toast gets the short one.
  if (message === t("common.tryAgain")) return showToast("Something went wrong", tone, options);
  warnIfToastLength(message);
  const now = Date.now();
  const dedupKey = `${options.title || ""}:${message}`;
  if (now - Number(recentToastKeys.get(dedupKey) || 0) < TOAST_DEDUP_MS) return;
  recentToastKeys.set(dedupKey, now);
  if (recentToastKeys.size > 20) {
    recentToastKeys.forEach((shownAt, key) => {
      if (now - shownAt > TOAST_DEDUP_MS) recentToastKeys.delete(key);
    });
  }
  toastHaptic(tone, options);
  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT, {
      detail: {
        id: `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        message,
        tone,
        title: options.title || "",
        duration: Number(options.duration || 3600),
        anchor: options.anchor || "",
        origin: options.origin === false ? null : readToastOrigin(),
        actionLabel: options.actionLabel || "",
        onAction: typeof options.onAction === "function" ? options.onAction : null,
        allowLongMessage: options.allowLongMessage === true,
        // Shown above full-screen overlays and modals (e.g. a registration
        // that finished in the background while another screen is open).
        elevated: options.elevated === true,
      },
    }),
  );
}
