import { useCallback, useEffect, useRef } from "react";

export function useBrowserBack(active, onBack, key = "kuntai-layer") {
  const onBackRef = useRef(onBack);
  const stateKeyRef = useRef(null);
  const handledRef = useRef(false);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const stateKey = `${key}-${Date.now()}`;
    stateKeyRef.current = stateKey;
    handledRef.current = false;
    window.history.pushState({ kuntaiBackLayer: stateKey }, "", window.location.href);

    function handlePopState(event) {
      if (event.state?.kuntaiBackLayer === stateKey) {
        return;
      }

      if (handledRef.current) {
        return;
      }

      handledRef.current = true;
      onBackRef.current?.();
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (stateKeyRef.current === stateKey) {
        stateKeyRef.current = null;
      }
    };
  }, [active, key]);

  return useCallback(() => {
    if (!active || !stateKeyRef.current) {
      onBackRef.current?.();
      return;
    }

    if (window.history.state?.kuntaiBackLayer === stateKeyRef.current) {
      window.history.back();
      return;
    }

    onBackRef.current?.();
  }, [active]);
}
