// The screen behind an open overlay never moves.
//
// Comments, sheets, dialogs and full-screen panels are fixed layers over a
// screen that stays mounted. A swipe on a part of the layer that cannot
// scroll (its header, a short list at its end, a clear backdrop) used to pass
// through to the screen behind, so the feed or list underneath scrolled while
// the overlay was open. useBodyScrollLock prevents that, but only for the
// overlays that call it; this does it for every overlay in the app:
// a touch that starts inside a fixed overlay (z-index 30 or more, covering
// most of the screen) may scroll things inside that overlay and nothing else.
//
// Inner scrollers (comment lists, threads, carousels, Swip, maps) keep working:
// only the browser's default scrolling outside the overlay is cancelled; the
// app's own touch handlers still receive every event.

const MIN_OVERLAY_Z = 30;

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

/** The fixed overlay a touch landed in, or null. Exported for tests. */
export function overlayFor(target, viewWidth = window.innerWidth, viewHeight = window.innerHeight) {
  for (let element = target instanceof Element ? target : null; element && element !== document.body; element = element.parentElement) {
    const style = window.getComputedStyle(element);
    if (style.position !== "fixed") continue;
    const z = Number.parseInt(style.zIndex, 10);
    if (!Number.isFinite(z) || z < MIN_OVERLAY_Z) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width >= viewWidth * 0.9 && rect.height >= viewHeight * 0.5) return element;
  }
  return null;
}

function scrollsInside(target, overlay, deltaX, deltaY) {
  for (let element = target instanceof Element ? target : null; element; element = element.parentElement) {
    if (canScroll(element, deltaX, deltaY)) return true;
    if (element === overlay) return false;
  }
  return false;
}

export function installOverlayScrollLock() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  let overlay = null;
  let startX = 0;
  let startY = 0;

  const onTouchStart = (event) => {
    overlay = event.touches.length === 1 ? overlayFor(event.target) : null;
    if (!overlay) return;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
  };

  const onTouchMove = (event) => {
    if (!overlay || !event.cancelable || !overlay.isConnected) return;
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    // A finger moving up scrolls the content down.
    const deltaX = startX - touch.clientX;
    const deltaY = startY - touch.clientY;
    if (!scrollsInside(event.target, overlay, deltaX, deltaY)) event.preventDefault();
  };

  const onTouchEnd = () => {
    overlay = null;
  };

  document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
  document.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
  document.addEventListener("touchend", onTouchEnd, { passive: true, capture: true });
  document.addEventListener("touchcancel", onTouchEnd, { passive: true, capture: true });

  return () => {
    document.removeEventListener("touchstart", onTouchStart, { capture: true });
    document.removeEventListener("touchmove", onTouchMove, { capture: true });
    document.removeEventListener("touchend", onTouchEnd, { capture: true });
    document.removeEventListener("touchcancel", onTouchEnd, { capture: true });
  };
}
