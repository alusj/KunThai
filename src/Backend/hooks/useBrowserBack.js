import { useEffect, useRef } from "react";

export function useBrowserBack(active, onBack, key = "kuntai-layer") {
  const onBackRef = useRef(onBack);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const stateKey = `${key}-${Date.now()}`;
    window.history.pushState({ kuntaiBackLayer: stateKey }, "", window.location.href);

    function handlePopState(event) {
      if (event.state?.kuntaiBackLayer === stateKey) {
        return;
      }

      onBackRef.current?.();
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [active, key]);
}
