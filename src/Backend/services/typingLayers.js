// No screen behind the screen you type in.
//
// KunThai opens most screens (a conversation, comments, sheets, Explore's
// stacked screens, UrMall and UrRide panels) as layers over screens that stay
// mounted and drawn underneath. On the iPhone the keyboard comes up before the
// WebView makes room for it (Keyboard resize "native"), and while it moves the
// page is drawn at more than one size, so for a moment the screen underneath
// shows through or around the one being typed in, and the app looks doubled.
// Partial sheets (comments are 84% of the height) shrink with the page and
// leave the screen behind showing above them for as long as the keyboard is up.
//
// As soon as a text field gets the focus (before the keyboard moves):
//   1. every layer drawn underneath the field's own screen is hidden
//      (visibility: hidden, so nothing reloads, scrolls or loses its place,
//      and the phone has less to draw), and
//   2. a partial sheet or dialog holding the field fills the screen.
// Both are undone when the field loses the focus and the keyboard is down.
// Fields in the page itself (not in a layer) change nothing.
//
// Toasts (data-kt-keep-visible) always stay visible.

const FIELD_SELECTOR = [
  "textarea",
  "[contenteditable='']",
  "[contenteditable='true']",
  "input:not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']):not([type='reset']):not([type='file']):not([type='range']):not([type='color']):not([type='hidden'])",
].join(",");

const HIDDEN_ATTR = "data-kt-under-typing";
const FULL_ATTR = "data-kt-typing-full";
const LOG_KEY = "kt-typing-layers-log";
const RELEASE_DELAY_MS = 160;

function isField(element) {
  return Boolean(element?.matches?.(FIELD_SELECTOR)) && !element.readOnly && !element.disabled;
}

// A layer: a fixed or absolutely placed box that covers (nearly) the whole
// width and at least half the height of the screen.
function isLayer(element, viewWidth, viewHeight) {
  if (!(element instanceof HTMLElement)) return false;
  const position = window.getComputedStyle(element).position;
  if (position !== "fixed" && position !== "absolute") return false;
  const rect = element.getBoundingClientRect();
  return rect.width >= viewWidth * 0.9 && rect.height >= viewHeight * 0.5;
}

function drawn(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hasAttribute(HIDDEN_ATTR) || element.hasAttribute("data-kt-keep-visible")) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function coversWholeScreen(element, viewWidth, viewHeight) {
  if (window.getComputedStyle(element).position !== "fixed") return false;
  const rect = element.getBoundingClientRect();
  return rect.left <= 1 && rect.top <= 1 && rect.width >= viewWidth * 0.98 && rect.height >= viewHeight * 0.9;
}

function overlap(a, b) {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

// At least 60% of the element's on-screen part lies under the covering
// screen. Only the visible part counts: a feed that scrolls the whole page is
// far taller than the screen.
function mostlyCovered(element, cover) {
  const rect = element.getBoundingClientRect();
  const screen = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const visible = overlap(rect, screen);
  if (visible < 1) return false;
  const visibleRect = {
    left: Math.max(rect.left, 0),
    top: Math.max(rect.top, 0),
    right: Math.min(rect.right, screen.right),
    bottom: Math.min(rect.bottom, screen.bottom),
  };
  return overlap(visibleRect, cover) / visible >= 0.6;
}

/**
 * What to change for a focused field: the elements drawn underneath its
 * layers (earlier siblings of each layer and of every box between the layers
 * and the page), and the partial sheet to stretch. Pure DOM reading.
 */
export function planTypingLayers(field, { viewWidth = window.innerWidth, viewHeight = window.innerHeight } = {}) {
  const layers = [];
  for (let node = field?.parentElement; node && node !== document.body; node = node.parentElement) {
    if (isLayer(node, viewWidth, viewHeight)) layers.push(node);
  }
  if (!layers.length) return { hide: [], sheet: null };

  // Everything drawn before the topmost layer's chain, from the outermost
  // layer up to <body>, is underneath. Inner layers hide their own earlier
  // siblings (a conversation over its conversation list).
  // Only what the field's screen actually covers is hidden: a header or tab
  // bar above a panel stays.
  const hide = new Set();
  const outermost = layers[layers.length - 1];
  const cover = layers[0].getBoundingClientRect();
  for (let node = layers[0]; node && node !== document.body; node = node.parentElement) {
    const insideOutermost = node === outermost || outermost.contains(node);
    if (!layers.includes(node) && insideOutermost) continue;
    // A fixed layer over the whole screen hides everything drawn before it
    // (content can spill far outside its box, so its size says nothing). An
    // in-page panel only hides what it really covers.
    const wholeScreen = coversWholeScreen(node, viewWidth, viewHeight);
    for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
      if (drawn(sibling) && !sibling.contains(field) && (wholeScreen || mostlyCovered(sibling, cover))) hide.add(sibling);
    }
  }

  // The partial sheet: the topmost layer's child on the way to the field,
  // when it is clearly shorter than the layer (a bottom sheet or dialog).
  let sheet = null;
  const top = layers[0];
  const topRect = top.getBoundingClientRect();
  for (let node = field.parentElement; node && node !== top; node = node.parentElement) {
    if (node.parentElement === top) {
      const rect = node.getBoundingClientRect();
      if (rect.height < topRect.height - 24) sheet = node;
      break;
    }
  }
  return { hide: Array.from(hide), sheet };
}

function writeLog(entry) {
  try {
    const log = JSON.parse(window.localStorage.getItem(LOG_KEY) || "[]");
    log.push(entry);
    window.localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-30)));
  } catch {
    // Diagnostics only.
  }
}

function describe(element) {
  return `${element.tagName.toLowerCase()}.${String(element.className || "").split(/\s+/).slice(0, 4).join(".")}`.slice(0, 90);
}

export function installTypingLayers() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  const root = document.documentElement;
  let hidden = [];
  let stretched = null;
  let activeField = null;
  let releaseTimer = 0;

  function release() {
    window.clearTimeout(releaseTimer);
    for (const element of hidden) element.removeAttribute(HIDDEN_ATTR);
    hidden = [];
    if (stretched) stretched.removeAttribute(FULL_ATTR);
    stretched = null;
    activeField = null;
    delete root.dataset.ktTypingLayer;
  }

  function apply(field) {
    if (field === activeField) return;
    release();
    const plan = planTypingLayers(field);
    if (!plan.hide.length && !plan.sheet) return;
    activeField = field;
    hidden = plan.hide;
    for (const element of hidden) element.setAttribute(HIDDEN_ATTR, "");
    if (plan.sheet) {
      stretched = plan.sheet;
      stretched.setAttribute(FULL_ATTR, "");
    }
    root.dataset.ktTypingLayer = "true";
    writeLog({
      at: new Date().toISOString(),
      field: describe(field),
      hidden: hidden.map(describe),
      sheet: stretched ? describe(stretched) : "",
      innerHeight: window.innerHeight,
      viewport: Math.round(window.visualViewport?.height || 0),
    });
  }

  function onFocusIn(event) {
    if (isField(event.target)) apply(event.target);
  }

  function onFocusOut() {
    // Focus moving to another field (or a button inside the same sheet) keeps
    // the layers as they are; only a real end of typing restores them.
    window.clearTimeout(releaseTimer);
    releaseTimer = window.setTimeout(() => {
      const current = document.activeElement;
      if (isField(current)) {
        apply(current);
        return;
      }
      if (root.dataset.ktKeyboardOpen === "true") return;
      release();
    }, RELEASE_DELAY_MS);
  }

  function onKeyboardHidden() {
    window.clearTimeout(releaseTimer);
    releaseTimer = window.setTimeout(() => {
      if (!isField(document.activeElement)) release();
    }, RELEASE_DELAY_MS);
  }

  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);
  window.addEventListener("keyboardDidHide", onKeyboardHidden);
  window.addEventListener("kuntai-keyboard-viewport-change", (event) => {
    if (!event.detail?.open) onKeyboardHidden();
  });

  return () => {
    document.removeEventListener("focusin", onFocusIn, true);
    document.removeEventListener("focusout", onFocusOut, true);
    window.removeEventListener("keyboardDidHide", onKeyboardHidden);
    release();
  };
}
