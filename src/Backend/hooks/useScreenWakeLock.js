import { useEffect } from "react";

// Keeps the screen on while `active` (Screen Wake Lock API). The browser drops
// the lock whenever the page is hidden, so it is re-requested when the page
// becomes visible again. Where the API is missing (older WebViews) this is a
// silent no-op: the screen just follows the phone's normal timeout.
export function useScreenWakeLock(active) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.wakeLock?.request) return undefined;
    let sentinel = null;
    let cancelled = false;

    async function acquire() {
      if (cancelled || document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) next.release().catch(() => {});
        else sentinel = next;
      } catch {
        // Denied (battery saver, not visible, policy): best effort only.
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}
