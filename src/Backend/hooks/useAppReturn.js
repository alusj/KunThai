import { useEffect, useRef } from "react";

// Runs onReturn when KunThai comes back to the screen (after the phone was
// locked or another app was used) and when the connection comes back. A chat
// uses it to reconnect its live feed and pick up anything sent meanwhile: the
// phone closes the live connection in the background, and it can take long
// to notice that on its own.
export function useAppReturn(onReturn, { enabled = true } = {}) {
  const callbackRef = useRef(onReturn);
  callbackRef.current = onReturn;

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return undefined;
    let hiddenAt = document.visibilityState === "hidden" ? Date.now() : 0;

    function handleVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt) {
        hiddenAt = 0;
        callbackRef.current?.("visible");
      }
    }

    function handleOnline() {
      callbackRef.current?.("online");
    }

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
    };
  }, [enabled]);
}
