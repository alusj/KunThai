import { t as i18nText } from "../../../i18n/index";

// DOM helpers for the long-press message menu (kept apart from the components
// so React fast refresh works).

// Where a held bubble sits and the part of the screen the menu may use: the
// chat thread, which ends at the header above and the composer below.
export function readMenuAnchor(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const thread = element.closest(".kt-message-thread");
  const threadRect = thread?.getBoundingClientRect();
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const bounds = threadRect
    ? { top: threadRect.top, bottom: Math.min(threadRect.bottom, viewportHeight), left: 0, right: window.innerWidth }
    : { top: 0, bottom: viewportHeight, left: 0, right: window.innerWidth };
  return { anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }, bounds };
}

export function quoteLabels() {
  return {
    deleted: i18nText("messageActions.deleted"),
    photo: i18nText("messageActions.photo"),
    voice: i18nText("messageActions.voice"),
    video: i18nText("messageActions.video"),
    location: i18nText("messageActions.location"),
    message: i18nText("messageActions.message"),
  };
}

// Brings the quoted message into view and flashes it.
export function revealMessage(threadElement, messageId) {
  const target = threadElement?.querySelector?.(`[data-message-id="${CSS.escape(String(messageId || ""))}"]`);
  if (!target) return false;
  target.scrollIntoView({ block: "center", behavior: "smooth" });
  target.classList.remove("kt-message-flash");
  // Restart the animation when the same message is revealed twice.
  void target.offsetWidth;
  target.classList.add("kt-message-flash");
  window.setTimeout(() => target.classList.remove("kt-message-flash"), 1300);
  return true;
}

export async function copyMessageText(text) {
  const value = String(text || "");
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Older WebViews without the async clipboard: copy through a hidden field.
    try {
      const field = document.createElement("textarea");
      field.value = value;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      return copied;
    } catch {
      return false;
    }
  }
}
