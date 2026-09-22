import { useEffect } from "react";

let lockCount = 0;
let releaseListeners = null;

// Lock page scrolling while an overlay (KAI, a sheet, a drawer) is open,
// without moving the page at all.
//
// Earlier versions set `overflow: hidden` on <html> and <body>. On mobile
// browsers that collapses the window's scroll offset to 0, so the dashboard
// jumped to the top the moment the overlay opened and only came back when it
// closed. The page's styles are now left untouched: the scroll gestures
// themselves are cancelled instead — touch drags, wheel and trackpad, and
// the scroll keys — unless they land in something inside the overlay that can
// still scroll in that direction, so lists and text areas in a sheet keep
// working. The page stays exactly where it was, with no offset to restore.

const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

function canScroll(element, deltaX, deltaY) {
  const style = window.getComputedStyle(element);
  if (deltaY !== 0 && /(auto|scroll|overlay)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1) {
    if (deltaY < 0 && element.scrollTop > 0) return true;
    if (deltaY > 0 && element.scrollTop + element.clientHeight < element.scrollHeight - 1) return true;
  }
  if (deltaX !== 0 && /(auto|scroll|overlay)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 1) {
    if (deltaX < 0 && element.scrollLeft > 0) return true;
    if (deltaX > 0 && element.scrollLeft + element.clientWidth < element.scrollWidth - 1) return true;
  }
  return false;
}

// True when something between the event target and the page root can take
// this scroll itself. The page root never counts: that is what is locked.
function scrollsInsideOverlay(target, deltaX, deltaY) {
  for (let element = target instanceof Element ? target : null; element; element = element.parentElement) {
    if (element === document.body || element === document.documentElement) return false;
    if (canScroll(element, deltaX, deltaY)) return true;
  }
  return false;
}

function isEditable(target) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']"));
}

// Exported for tests; components use the hook below.
export function acquireBodyScrollLock() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  lockCount += 1;
  if (lockCount === 1) {
    let touchX = 0;
    let touchY = 0;

    const onTouchStart = (event) => {
      if (event.touches.length !== 1) return;
      touchX = event.touches[0].clientX;
      touchY = event.touches[0].clientY;
    };
    const onTouchMove = (event) => {
      if (!event.cancelable) return;
      if (event.touches.length !== 1) {
        event.preventDefault();
        return;
      }
      const touch = event.touches[0];
      // A finger moving up scrolls the content down.
      const deltaX = touchX - touch.clientX;
      const deltaY = touchY - touch.clientY;
      if (!scrollsInsideOverlay(event.target, deltaX, deltaY)) event.preventDefault();
    };
    const onWheel = (event) => {
      if (!event.cancelable || event.ctrlKey) return; // ctrl+wheel is browser zoom
      if (!scrollsInsideOverlay(event.target, event.deltaX, event.deltaY)) event.preventDefault();
    };
    const onKeyDown = (event) => {
      if (!SCROLL_KEYS.has(event.key) || isEditable(event.target)) return;
      const deltaY = ["ArrowUp", "PageUp", "Home"].includes(event.key) ? -1 : 1;
      if (!scrollsInsideOverlay(event.target, 0, deltaY)) event.preventDefault();
    };

    const options = { passive: false, capture: true };
    document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", onTouchMove, options);
    document.addEventListener("wheel", onWheel, options);
    document.addEventListener("keydown", onKeyDown, { capture: true });
    releaseListeners = () => {
      document.removeEventListener("touchstart", onTouchStart, { capture: true });
      document.removeEventListener("touchmove", onTouchMove, options);
      document.removeEventListener("wheel", onWheel, options);
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount !== 0) return;
    releaseListeners?.();
    releaseListeners = null;
  };
}

export default function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    return acquireBodyScrollLock();
  }, [active]);
}
