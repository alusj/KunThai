// Keeps the text field being typed in clear of the keyboard, everywhere in the
// app: the Explore composer, comments, orders, bookings, registrations and
// every other form. Nobody has to scroll to find the field they tapped.
//
// In the app the keyboard shrinks the WebView (Keyboard resize "native"), but
// nothing scrolls the field into what is left: a field low in a sheet or a
// drawer stays under the keyboard, or under the sheet's own sticky footer
// ("Save settings"). Once the keyboard is up, and whenever another field gets
// the focus while it is up, the field's own scroll containers glide just far
// enough (smooth scrolling) to show it with a little room below. Where a
// container has no more room to scroll, it gets temporary room at its end,
// which is taken away again when the keyboard closes.
//
// Fields that already sit above the keyboard (message and comment boxes
// pinned to the bottom) are visible, so nothing moves for them.

import { Capacitor } from "@capacitor/core";

const FIELD_SELECTOR = [
  "textarea",
  "[contenteditable='']",
  "[contenteditable='true']",
  "input:not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']):not([type='reset']):not([type='file']):not([type='range']):not([type='color']):not([type='hidden'])",
].join(",");
// Boxes that position themselves above the keyboard.
const OPT_OUT_SELECTOR = "[data-kt-keyboard-avoid='off'], .kt-message-composer, .kt-comment-composer";
// Room kept between the field and the keyboard (or a sticky footer).
const GAP_BELOW = 20;
const GAP_ABOVE = 12;
const SETTLE_MS = 90;

function isField(element) {
  return Boolean(element?.matches?.(FIELD_SELECTOR)) && !element.closest(OPT_OUT_SELECTOR) && !element.readOnly && !element.disabled;
}

function isScrollable(element) {
  if (!(element instanceof HTMLElement)) return false;
  const overflowY = window.getComputedStyle(element).overflowY;
  return (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") && element.clientHeight > 0;
}

function scrollAncestors(element) {
  const list = [];
  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
    if (isScrollable(node)) list.push(node);
  }
  const page = document.scrollingElement;
  if (page && page.scrollHeight > page.clientHeight + 1) list.push(page);
  return list;
}

export function installKeyboardFieldVisibility() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  const root = document.documentElement;
  const viewport = window.visualViewport;
  const nativeApp = Capacitor.isNativePlatform();
  const extended = new Map(); // scroller -> original inline padding-bottom
  let timer = 0;
  let restoreTimer = 0;

  function keyboardOpen() {
    if (nativeApp) return root.dataset.ktKeyboardOpen === "true";
    // A mobile browser: the keyboard shows as a much smaller visual viewport.
    return Boolean(viewport && viewport.height < window.innerHeight - 120);
  }

  // The bottom of what is visible above the keyboard, in viewport pixels.
  function visibleBottom() {
    if (nativeApp) {
      const overlap = parseFloat(root.style.getPropertyValue("--kt-keyboard-overlap")) || 0;
      return window.innerHeight - overlap;
    }
    return viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
  }

  function restoreRoom() {
    for (const [scroller, padding] of extended) scroller.style.paddingBottom = padding;
    extended.clear();
  }

  function extendRoom(scroller, amount) {
    if (!extended.has(scroller)) extended.set(scroller, scroller.style.paddingBottom);
    const current = parseFloat(window.getComputedStyle(scroller).paddingBottom) || 0;
    scroller.style.paddingBottom = `${Math.ceil(current + amount)}px`;
  }

  function reveal(field) {
    if (!field?.isConnected || document.activeElement !== field || !keyboardOpen()) return;
    const rect = field.getBoundingClientRect();
    if (!rect.height && !rect.width) return;

    const scrollers = scrollAncestors(field);
    const inner = scrollers[0] && scrollers[0] !== document.scrollingElement ? scrollers[0].getBoundingClientRect() : null;
    // A sheet's sticky footer or header sits outside its scroll container,
    // so the container's own edges bound what can be seen.
    const bottom = Math.min(visibleBottom(), inner ? inner.bottom : Infinity) - GAP_BELOW;
    const top = Math.max(viewport?.offsetTop || 0, inner ? inner.top : 0) + GAP_ABOVE;

    let delta = 0;
    if (rect.bottom > bottom) {
      // A tall textarea shows from its top line rather than being pushed off.
      delta = Math.min(rect.bottom - bottom, rect.top - top);
    } else if (rect.top < top) {
      delta = rect.top - top;
    }
    if (Math.abs(delta) < 2) return;

    let remaining = delta;
    for (const scroller of scrollers) {
      if (Math.abs(remaining) < 2) break;
      const max = scroller.scrollHeight - scroller.clientHeight;
      let room = remaining > 0 ? max - scroller.scrollTop : -scroller.scrollTop;
      if (remaining > 0 && room < remaining && scroller === scrollers[0] && scroller !== document.scrollingElement) {
        // The field is near the end of its sheet: make room so it can rise.
        extendRoom(scroller, remaining - Math.max(0, room));
        room = remaining;
      }
      const step = remaining > 0 ? Math.min(remaining, Math.max(0, room)) : Math.max(remaining, room);
      if (!step) continue;
      scroller.scrollBy({ top: step, behavior: "smooth" });
      remaining -= step;
    }
  }

  // Layout keeps changing while the keyboard opens (the page shrinks some
  // time after the keyboard event), so one reveal runs once it has settled.
  function schedule(delay = SETTLE_MS) {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const field = document.activeElement;
      if (isField(field)) reveal(field);
    }, delay);
  }

  function handleFocusIn(event) {
    if (!isField(event.target)) return;
    window.clearTimeout(restoreTimer);
    if (keyboardOpen()) schedule(40);
  }

  function handleFocusOut() {
    window.clearTimeout(restoreTimer);
    restoreTimer = window.setTimeout(() => {
      if (!isField(document.activeElement) && !keyboardOpen()) restoreRoom();
    }, 400);
  }

  function handleKeyboardChange(event) {
    if (event.detail?.open) schedule();
    else {
      window.clearTimeout(timer);
      restoreRoom();
    }
  }

  function handleResize() {
    if (isField(document.activeElement)) schedule();
  }

  // A textarea that grows a line while typing keeps its new line in view.
  function handleInput(event) {
    if (event.target?.tagName === "TEXTAREA" && isField(event.target)) schedule(60);
  }

  document.addEventListener("focusin", handleFocusIn);
  document.addEventListener("focusout", handleFocusOut);
  document.addEventListener("input", handleInput);
  window.addEventListener("kuntai-keyboard-viewport-change", handleKeyboardChange);
  window.addEventListener("resize", handleResize);
  viewport?.addEventListener("resize", handleResize);

  return () => {
    window.clearTimeout(timer);
    window.clearTimeout(restoreTimer);
    restoreRoom();
    document.removeEventListener("focusin", handleFocusIn);
    document.removeEventListener("focusout", handleFocusOut);
    document.removeEventListener("input", handleInput);
    window.removeEventListener("kuntai-keyboard-viewport-change", handleKeyboardChange);
    window.removeEventListener("resize", handleResize);
    viewport?.removeEventListener("resize", handleResize);
  };
}
