export const TOAST_EVENT = "kuntai-toast";

// The most recent pointer press, used to draw a small arrow on the toast that
// points back at the icon/button the action came from.
let lastPointerPress = null;

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

export function showToast(message, tone = "info", options = {}) {
  if (!message) return;
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
      },
    }),
  );
}
