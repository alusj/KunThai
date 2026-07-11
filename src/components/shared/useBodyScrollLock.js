import { useEffect } from "react";

let lockCount = 0;
let savedStyles = null;

// Lock scrolling without repositioning the body. The legacy
// `position: fixed; top: -scrollY` technique shifted the page out of view
// whenever the saved offset was stale (common on iOS during momentum
// scrolling), leaving overlays over an empty background and jumping the
// feed on release. Plain overflow locking keeps the page exactly where it
// is, so backdrop blur always has real content to sample.
function acquireBodyScrollLock() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  lockCount += 1;
  if (lockCount === 1) {
    const body = document.body;
    const html = document.documentElement;
    savedStyles = {
      bodyOverflow: body.style.overflow,
      bodyOverscrollBehavior: body.style.overscrollBehavior,
      htmlOverflow: html.style.overflow,
      htmlOverscrollBehavior: html.style.overscrollBehavior,
      // Mobile Safari collapses the window scroll offset to 0 when the root
      // element becomes overflow:hidden, so the position must be captured
      // here and restored on release or the page reopens at the very top.
      scrollX: window.scrollX || 0,
      scrollY: window.scrollY || 0,
    };

    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
  }

  return () => {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount !== 0 || !savedStyles) return;

    const body = document.body;
    const html = document.documentElement;
    const { scrollX, scrollY } = savedStyles;
    body.style.overflow = savedStyles.bodyOverflow;
    body.style.overscrollBehavior = savedStyles.bodyOverscrollBehavior;
    html.style.overflow = savedStyles.htmlOverflow;
    html.style.overscrollBehavior = savedStyles.htmlOverscrollBehavior;
    savedStyles = null;

    // Only repair the collapse-to-top case so intentional programmatic
    // scrolls performed while the lock was held (e.g. jump-to-post) survive.
    if (scrollY > 0 && (window.scrollY || 0) === 0) {
      window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
    }
  };
}

export default function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    return acquireBodyScrollLock();
  }, [active]);
}
