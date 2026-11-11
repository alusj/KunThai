// The keyboard in a chat: the screen stays still and the message box rides up
// and down with the keyboard, as in WhatsApp and TikTok.
//
// The native page resizes in one jump, and never in step with the keyboard
// (Android grows it about 270 ms before the keyboard has gone down). So while
// a chat is open the page keeps its full height (setNativeChatKeyboard), and
// the message box and the thread move with transforms, which the phone draws
// without laying anything out. Android reports the keyboard's height on every
// frame of its slide, and they follow that; iOS reports only the start, and
// they run the same curve as the keyboard.
//
// When the keyboard has arrived the transforms are swapped, within one frame,
// for real room at the bottom of the screen, so the whole thread can be
// scrolled while typing. Closing starts with the opposite swap.
//
// Other fields in a chat (a report form) are not tied to the message box and
// get the normal native resize back while they have the focus.

import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import { setNativeChatKeyboard } from "./nativeLaunch.js";

// Gap between the message box's own row and the keyboard.
const KEYBOARD_GAP = 8;
const LAST_MESSAGE_GAP = 16;
const SETTLE_EXTRA_MS = 40;
// The first keyboard after the app starts can be most of the way up before the
// page hears of it. The message box then catches up in a short slide.
const CATCH_UP_FROM = 0.3;
const CATCH_UP_MS = 120;

// Android (frames) settles when the keyboard says it has landed; the long
// times there only cover a landing that is never reported.
const MOTION = {
  ios: { open: 250, close: 250, ease: "cubic-bezier(0.38, 0.7, 0.125, 1)", frames: false },
  android: { open: 700, close: 700, ease: "linear", frames: true },
};

/** How far the message box rises so its row sits just above the keyboard. */
export function composerLift({ keyboardHeight, composerPaddingBottom, viewportHeight, screenBottom }) {
  const belowScreen = Math.max(0, viewportHeight - screenBottom);
  return Math.max(0, Math.round(keyboardHeight - composerPaddingBottom + KEYBOARD_GAP - belowScreen));
}

/**
 * How far the messages must rise to stay clear of the risen message box. A
 * short conversation that already clears it stays put instead of going under
 * the header.
 */
export function threadShift({ lastMessageBottom, threadBottom, lift }) {
  if (lastMessageBottom == null) return 0;
  return Math.min(lift, Math.max(0, Math.round(lastMessageBottom + LAST_MESSAGE_GAP - (threadBottom - lift))));
}

/** The offset that keeps the messages in place when the thread regains its room. */
export function closingOffset(scrollTopBefore, scrollTopAfter) {
  return Math.min(0, scrollTopAfter - scrollTopBefore);
}

function isField(element) {
  return Boolean(element?.matches?.("textarea, input, [contenteditable='true'], [contenteditable='']"));
}

function translateY(element) {
  const value = window.getComputedStyle(element).transform;
  if (!value || value === "none") return 0;
  return new DOMMatrixReadOnly(value).m42;
}

function move(element, y, ms, ease) {
  if (!element) return;
  element.style.transition = ms ? `transform ${ms}ms ${ease}` : "none";
  element.style.transform = `translate3d(0, ${y}px, 0)`;
}

function clearMotion(element) {
  if (!element) return;
  element.style.transition = "";
  element.style.transform = "";
}

export function startChatKeyboardGlide(getThread) {
  const platform = Capacitor.getPlatform();
  const motion = MOTION[platform] || MOTION.android;
  let lift = 0; // Current rise of the message box.
  let padded = false; // The screen has real room for the keyboard.
  let raising = false;
  let shift = 0;
  let threadTravel = 0; // Where the thread is when the keyboard is fully up.
  let keyboardTarget = 0;
  let framesSeen = false;
  let catchUpUntil = 0;
  let settleTimer = 0;
  let nativeActive = null;

  function parts() {
    const thread = getThread();
    const screen = thread?.closest(".kt-conversation-screen") || null;
    const composer = screen?.querySelector(".kt-message-composer") || null;
    return thread && screen && composer ? { thread, screen, composer } : null;
  }

  function setNative(active) {
    if (nativeActive === active) return;
    nativeActive = active;
    if (active) document.documentElement.dataset.ktChatKeyboard = "true";
    else delete document.documentElement.dataset.ktChatKeyboard;
    if (platform === "ios") Keyboard.setResizeMode({ mode: active ? "none" : "native" }).catch(() => {});
    setNativeChatKeyboard(active);
  }

  function composerHasFocus() {
    return Boolean(document.activeElement?.closest?.(".kt-message-composer"));
  }

  function settleOpen() {
    raising = false;
    const found = parts();
    if (!found) return;
    const { thread, screen, composer } = found;
    clearMotion(composer);
    clearMotion(thread);
    screen.style.paddingBottom = `${lift}px`;
    thread.scrollTop += shift;
    padded = true;
  }

  function settleClosed() {
    lift = 0;
    shift = 0;
    const found = parts();
    if (!found) return;
    clearMotion(found.composer);
    clearMotion(found.thread);
  }

  function open(keyboardHeight) {
    if (!keyboardHeight || !composerHasFocus()) return;
    const found = parts();
    if (!found) return;
    const { thread, screen, composer } = found;
    const nextLift = composerLift({
      keyboardHeight,
      composerPaddingBottom: parseFloat(window.getComputedStyle(composer).paddingBottom) || 0,
      viewportHeight: window.innerHeight,
      screenBottom: screen.getBoundingClientRect().bottom,
    });

    if (padded) {
      // The keyboard changed height (suggestions, emoji) while open.
      if (Math.abs(nextLift - lift) < 1) return;
      const change = nextLift - lift;
      lift = nextLift;
      screen.style.paddingBottom = `${lift}px`;
      thread.scrollTop += change;
      return;
    }

    // The same height again (Android repeats it when the keyboard has landed).
    if (raising && Math.abs(nextLift - lift) < 1) return;

    const threadOffset = translateY(thread);
    const messages = thread.querySelectorAll("[data-message-id]");
    const last = messages[messages.length - 1];
    lift = nextLift;
    // Reading the newest message: it stays exactly at the end of the thread.
    const atEnd = thread.scrollHeight > thread.clientHeight + 1
      && thread.scrollTop + thread.clientHeight >= thread.scrollHeight - 2;
    shift = atEnd ? lift : threadShift({
      lastMessageBottom: last ? last.getBoundingClientRect().bottom - threadOffset : null,
      threadBottom: thread.getBoundingClientRect().bottom - threadOffset,
      lift,
    });
    raising = true;
    framesSeen = false;
    keyboardTarget = keyboardHeight;
    threadTravel = -shift;
    if (!motion.frames) {
      move(composer, -lift, motion.open, motion.ease);
      move(thread, -shift, motion.open, motion.ease);
    }
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(settleOpen, motion.open + SETTLE_EXTRA_MS);
  }

  function close() {
    window.clearTimeout(settleTimer);
    const found = parts();
    if (!found) return;
    const { thread, screen, composer } = found;
    raising = false;
    if (padded) {
      padded = false;
      const before = thread.scrollTop;
      screen.style.paddingBottom = "";
      thread.scrollTop = before - lift;
      threadTravel = closingOffset(before, thread.scrollTop);
      move(composer, -lift, 0);
      move(thread, threadTravel, 0);
      void composer.offsetHeight;
    } else if (!lift) {
      return;
    }
    if (!motion.frames) {
      move(composer, 0, motion.close, motion.ease);
      move(thread, 0, motion.close, motion.ease);
    }
    settleTimer = window.setTimeout(settleClosed, motion.close + SETTLE_EXTRA_MS);
  }

  function frame(height) {
    if (!lift || !keyboardTarget) return;
    const found = parts();
    if (!found || (padded && height >= keyboardTarget)) return;
    const part = Math.min(1, Math.max(0, height / keyboardTarget));
    const now = performance.now();
    if (raising && !framesSeen && part > CATCH_UP_FROM) {
      framesSeen = true;
      catchUpUntil = now + CATCH_UP_MS;
      move(found.composer, -lift * part, CATCH_UP_MS, "ease-out");
      move(found.thread, threadTravel * part, CATCH_UP_MS, "ease-out");
      return;
    }
    framesSeen = true;
    if (now < catchUpUntil) return;
    move(found.composer, -lift * part, 0);
    move(found.thread, threadTravel * part, 0);
  }

  const onShow = (event) => open(Number(event?.keyboardHeight || 0));
  const onDidShow = (event) => {
    open(Number(event?.keyboardHeight || 0));
    if (motion.frames && raising) {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settleOpen, Math.max(0, catchUpUntil - performance.now()));
    }
  };
  const onHide = () => close();
  const onDidHide = () => {
    if (!motion.frames || !lift || padded || raising) return;
    window.clearTimeout(settleTimer);
    settleClosed();
  };

  const onFocusIn = (event) => {
    if (isField(event.target)) setNative(Boolean(event.target.closest(".kt-message-composer")));
  };
  const onFocusOut = () => {
    window.setTimeout(() => {
      if (!isField(document.activeElement)) setNative(true);
    }, 0);
  };

  setNative(true);
  window.addEventListener("keyboardWillShow", onShow);
  window.addEventListener("keyboardDidShow", onDidShow);
  window.addEventListener("keyboardWillHide", onHide);
  window.addEventListener("keyboardDidHide", onDidHide);
  if (motion.frames) window.__ktChatKeyboardFrame = frame;
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);

  return () => {
    window.clearTimeout(settleTimer);
    window.removeEventListener("keyboardWillShow", onShow);
    window.removeEventListener("keyboardDidShow", onDidShow);
    window.removeEventListener("keyboardWillHide", onHide);
    window.removeEventListener("keyboardDidHide", onDidHide);
    if (window.__ktChatKeyboardFrame === frame) delete window.__ktChatKeyboardFrame;
    document.removeEventListener("focusin", onFocusIn, true);
    document.removeEventListener("focusout", onFocusOut, true);
    const found = parts();
    if (found) {
      found.screen.style.paddingBottom = "";
      clearMotion(found.composer);
      clearMotion(found.thread);
    }
    setNative(false);
  };
}
