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

// Save image / Copy image from a long-press menu, with the toast that says
// how it went. url: the photo as stored (a private chat photo is signed first).
export async function runImageAction(key, url) {
  const { saveImageToPhotos, copyImageToClipboard } = await import("../../../Backend/services/media/imageActions.js");
  const { showToast } = await import("../../../Backend/services/toastService");
  if (key === "saveImage") {
    try {
      const result = await saveImageToPhotos(url);
      if (result === "denied") showToast(i18nText("messageActions.photosDenied"), "danger");
      else showToast(i18nText("messageActions.imageSaved"), "success");
    } catch {
      showToast(i18nText("messageActions.saveFailed"), "danger");
    }
    return;
  }
  if (key === "copyImage") {
    const result = await copyImageToClipboard(url);
    if (result === "image") showToast(i18nText("messageActions.imageCopied"), "success");
    else if (result === "link") showToast(i18nText("messageActions.linkCopied"), "success");
    else showToast(i18nText("messageActions.copyFailed"), "danger");
  }
}

// Files a report from the Report sheet and says how it went. Returns true
// when the sheet can close.
export async function submitReport(target, { reason, details }) {
  const { reportContent } = await import("../../../Backend/services/media/imageActions.js");
  const { showToast } = await import("../../../Backend/services/toastService");
  try {
    const result = await reportContent({ ...target, reason, details });
    if (result.alreadyReported) showToast(i18nText("messageActions.alreadyReported"), "info");
    else showToast(i18nText("messageActions.reportSent"), "success");
    return true;
  } catch {
    showToast(i18nText("messageActions.reportFailed"), "danger");
    return false;
  }
}

// Two sets of pointer handlers on one element (a photo viewer's swipe, pinch
// and pan, plus the long press): the extra ones run first. The lift that ends
// a long press reaches the viewer as a cancel, not a tap that would close it.
export function combineHandlers(own = {}, extra = {}) {
  const combined = { ...own };
  Object.entries(extra).forEach(([name, handler]) => {
    const first = own[name];
    combined[name] = first
      ? (event) => {
        handler(event);
        if (name === "onPointerUp" && event?.nativeEvent?.ktLongPressLift && own.onPointerCancel) own.onPointerCancel(event);
        else first(event);
      }
      : handler;
  });
  return combined;
}
