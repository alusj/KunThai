const NAVIGATION_GESTURE_LOCK_SELECTOR = [
  "[data-gesture-lock]:not([data-gesture-lock='false'])",
  "[data-suppress-app-swipe]",
  "[data-suppress-tab-swipe]",
  "[data-map-gesture-surface]",
  "[role='slider']",
  "video[controls]",
  "[data-carousel]",
  "[data-horizontal-scroll]",
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  ".overflow-x-auto",
  ".overflow-x-scroll",
  ".maplibregl-map",
].join(", ");

const ACTIVE_LAYER_SELECTOR = "[aria-modal='true'], [data-gesture-layer='active']";

let nextLockId = 1;
const activeLocks = new Map();
let navigationSuppressedUntil = 0;

function nowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function hasHiddenAncestor(element) {
  let current = element;
  while (current && current.nodeType === 1) {
    if (
      current.hidden ||
      current.hasAttribute?.("inert") ||
      current.getAttribute?.("aria-hidden") === "true"
    ) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

export function isVisibleGestureLayer(element) {
  if (!element || hasHiddenAncestor(element)) return false;
  if (typeof window === "undefined" || typeof window.getComputedStyle !== "function") return true;

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") return false;

  const rect = element.getBoundingClientRect?.();
  if (!rect) return true;
  return rect.width > 0 && rect.height > 0;
}

export function isGestureOwnedTarget(target) {
  if (!target?.closest) return false;
  if (target.closest(NAVIGATION_GESTURE_LOCK_SELECTOR)) return true;

  if (typeof window !== "undefined" && typeof window.getSelection === "function") {
    const selection = window.getSelection();
    if (selection?.type === "Range" && !selection.isCollapsed) return true;
  }

  return false;
}

export function hasActiveGestureLayer() {
  if (typeof document === "undefined") return false;
  return Array.from(document.querySelectorAll(ACTIVE_LAYER_SELECTOR)).some(isVisibleGestureLayer);
}

export function suppressNavigationGestures(durationMs = 320) {
  navigationSuppressedUntil = Math.max(navigationSuppressedUntil, nowMs() + Math.max(0, durationMs));
}

export function acquireGestureLock(owner = "gesture-owner") {
  const id = nextLockId++;
  activeLocks.set(id, owner);
  let released = false;

  return function releaseGestureLock({ suppressMs = 320 } = {}) {
    if (released) return;
    released = true;
    activeLocks.delete(id);
    if (suppressMs > 0) suppressNavigationGestures(suppressMs);
  };
}

export function navigationGesturesLocked(at = nowMs()) {
  return activeLocks.size > 0 || at < navigationSuppressedUntil;
}

export function canStartNavigationGesture(target, { allowInActiveLayer = false, at } = {}) {
  if (navigationGesturesLocked(at ?? nowMs())) return false;
  if (isGestureOwnedTarget(target)) return false;
  if (!allowInActiveLayer && hasActiveGestureLayer()) return false;
  return true;
}

export function classifyBackSwipe({
  deltaX = 0,
  deltaY = 0,
  elapsedMs = 1,
  minDistance = 64,
  minVelocity = 0.45,
  maxVerticalDrift = 80,
  axisRatio = 1.2,
  minFlingDistance = 28,
} = {}) {
  const horizontal = Number(deltaX) || 0;
  const vertical = Math.abs(Number(deltaY) || 0);
  const velocity = horizontal / Math.max(1, Number(elapsedMs) || 1);
  const primarilyHorizontal = horizontal > 0 && horizontal > vertical * axisRatio;
  const farEnough = horizontal >= minDistance;
  const fastEnough = horizontal >= minFlingDistance && velocity >= minVelocity;

  return {
    commit: primarilyHorizontal && vertical <= maxVerticalDrift && (farEnough || fastEnough),
    primarilyHorizontal,
    velocity,
  };
}

// Test-only reset kept explicit so unit tests cannot leak a lock into the next case.
export function resetGestureArbitrationForTests() {
  activeLocks.clear();
  navigationSuppressedUntil = 0;
}
