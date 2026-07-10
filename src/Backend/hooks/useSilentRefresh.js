import { useEffect, useRef } from "react";

// Keeps a screen's data fresh without any visible loading state: the refresh
// callback runs when the tab becomes visible again and on a timer while the
// tab stays visible. Callers pass a refresh that reuses cached data first so
// the update is silent.
export function useSilentRefresh(refresh, { intervalMs = 60000, enabled = true } = {}) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled) return undefined;

    function runSilently() {
      if (document.visibilityState === "visible") refreshRef.current?.();
    }

    const interval = window.setInterval(runSilently, intervalMs);
    document.addEventListener("visibilitychange", runSilently);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", runSilently);
    };
  }, [enabled, intervalMs]);
}
