export const TOAST_EVENT = "kuntai-toast";

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
        actionLabel: options.actionLabel || "",
        onAction: typeof options.onAction === "function" ? options.onAction : null,
      },
    }),
  );
}
