import { useCallback, useEffect, useRef } from "react";

const browserBackLayers = new Set();
let browserBackListening = false;
let currentBrowserLayerKey = null;
let nextBrowserLayerId = 1;
// Set while clearBrowserBackStack() rewinds history, so the layers being
// skipped are not each "closed" one by one.
let clearingBackStack = false;

function readLayerKey(state = window.history.state) {
  return state?.kuntaiBackLayer || null;
}

function readLayerDepth(state = window.history.state) {
  return Number(state?.kuntaiBackDepth) || 0;
}

function handleSharedPopState(event) {
  const exitedLayerKey = currentBrowserLayerKey;
  currentBrowserLayerKey = readLayerKey(event.state);
  if (clearingBackStack) {
    if (readLayerDepth(event.state) === 0) clearingBackStack = false;
    return;
  }
  if (!exitedLayerKey || exitedLayerKey === currentBrowserLayerKey) return;

  const exitedLayer = Array.from(browserBackLayers).find((entry) => entry.stateKey === exitedLayerKey);
  if (!exitedLayer || exitedLayer.handled) return;
  exitedLayer.handled = true;
  exitedLayer.onBackRef.current?.();
}

function startBrowserBackCoordinator() {
  if (browserBackListening || typeof window === "undefined") return;
  browserBackListening = true;
  currentBrowserLayerKey = readLayerKey();
  window.addEventListener("popstate", handleSharedPopState);
}

function stopBrowserBackCoordinatorIfIdle() {
  if (!browserBackListening || browserBackLayers.size) return;
  browserBackListening = false;
  currentBrowserLayerKey = null;
  window.removeEventListener("popstate", handleSharedPopState);
}

export function useBrowserBack(active, onBack, key = "kuntai-layer") {
  const onBackRef = useRef(onBack);
  const stateKeyRef = useRef(null);

  onBackRef.current = onBack;

  useEffect(() => {
    if (!active) return undefined;

    const stateKey = `${key}-${Date.now()}-${nextBrowserLayerId++}`;
    stateKeyRef.current = stateKey;
    const entry = { handled: false, onBackRef, stateKey };
    browserBackLayers.add(entry);
    startBrowserBackCoordinator();
    window.history.pushState(
      { kuntaiBackLayer: stateKey, kuntaiBackDepth: readLayerDepth() + 1 },
      "",
      window.location.href,
    );
    currentBrowserLayerKey = stateKey;
    return () => {
      browserBackLayers.delete(entry);
      if (stateKeyRef.current === stateKey) {
        stateKeyRef.current = null;
      }
      stopBrowserBackCoordinatorIfIdle();
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

// Drop every in-app screen entry from the browser history so Back starts from
// a clean dashboard (used after a long time away). Screens record their depth
// in history.state, so this works even after they have unmounted. Returns the
// number of entries removed.
export function clearBrowserBackStack() {
  if (typeof window === "undefined") return 0;
  const depth = readLayerDepth();
  if (!depth) return 0;
  browserBackLayers.forEach((entry) => { entry.handled = true; });
  if (browserBackListening) {
    clearingBackStack = true;
    window.setTimeout(() => { clearingBackStack = false; }, 1500);
  }
  window.history.go(-depth);
  return depth;
}
