import { useEffect, useRef } from "react";

import {
  canStartNavigationGesture,
  classifyBackSwipe,
  isVisibleGestureLayer,
  suppressNavigationGestures,
} from "../services/gestureArbitration";

const DEFAULTS = {
  edgeWidth: 180,
  minDistance: 64,
  minVelocity: 0.45,
  maxVerticalDrift: 80,
  axisRatio: 1.2,
};

let nextRegistrationOrder = 1;
const registeredBackTargets = new Set();
let coordinatorGesture = null;
let coordinatorListening = false;

function getSettings(options = {}) {
  return { ...DEFAULTS, ...options };
}

function getLayerRoot(node) {
  if (!node) return null;
  const explicit = node.closest?.("[data-back-swipe-scope], .kt-urmall-screen-panel");
  if (explicit) return explicit;

  let current = node.parentElement;
  while (current && current !== document.body) {
    const style = window.getComputedStyle?.(current);
    if (style?.position === "fixed") return current;
    current = current.parentElement;
  }

  return node.closest?.("section, aside, main") || document.body;
}

function getLayerDepth(node) {
  let depth = 0;
  let current = node;
  while (current?.parentElement) {
    depth += 1;
    current = current.parentElement;
  }
  return depth;
}

function getLayerZIndex(node) {
  let zIndex = 0;
  let current = node;
  while (current && current !== document.body) {
    const parsed = Number.parseInt(window.getComputedStyle?.(current)?.zIndex, 10);
    if (Number.isFinite(parsed)) zIndex = Math.max(zIndex, parsed);
    current = current.parentElement;
  }
  return zIndex;
}

function chooseRegisteredTarget(eventTarget) {
  if (eventTarget?.closest?.("[data-local-back-swipe]")) return null;

  const ownedLayer = eventTarget?.closest?.("[aria-modal='true'], [data-gesture-layer='active']");
  const visibleLayers = typeof document === "undefined"
    ? []
    : Array.from(document.querySelectorAll("[aria-modal='true'], [data-gesture-layer='active']"))
        .filter(isVisibleGestureLayer);
  const activeModal = ownedLayer || visibleLayers.at(-1) || null;
  const candidates = Array.from(registeredBackTargets)
    .map((entry) => ({ ...entry, node: entry.nodeRef.current }))
    .filter((entry) => entry.node && isVisibleGestureLayer(entry.node))
    .filter((entry) => !activeModal || activeModal.contains(entry.node))
    .map((entry) => {
      const scope = getLayerRoot(entry.node);
      return {
        ...entry,
        scope,
        containsTarget: Boolean(scope?.contains?.(eventTarget)),
        depth: getLayerDepth(scope),
        zIndex: getLayerZIndex(scope),
      };
    });

  const scoped = candidates.some((entry) => entry.containsTarget)
    ? candidates.filter((entry) => entry.containsTarget)
    : candidates;

  return scoped.sort((first, second) =>
    second.zIndex - first.zIndex ||
    second.depth - first.depth ||
    second.order - first.order,
  )[0] || null;
}

function handleCoordinatorTouchStart(event) {
  const touch = event.touches?.[0];
  if (
    event.touches?.length !== 1 ||
    !touch ||
    !canStartNavigationGesture(event.target, { allowInActiveLayer: true })
  ) {
    coordinatorGesture = null;
    return;
  }

  const entry = chooseRegisteredTarget(event.target);
  if (!entry) {
    coordinatorGesture = null;
    return;
  }

  const settings = getSettings(entry.optionsRef.current);
  if (touch.clientX > settings.edgeWidth) {
    coordinatorGesture = null;
    return;
  }

  coordinatorGesture = {
    entry,
    settings,
    startX: touch.clientX,
    startY: touch.clientY,
    lastX: touch.clientX,
    lastY: touch.clientY,
    startedAt: event.timeStamp || Date.now(),
    axis: null,
    cancelled: false,
  };
}

function handleCoordinatorTouchMove(event) {
  const gesture = coordinatorGesture;
  const touch = event.touches?.[0];
  if (!gesture || event.touches?.length !== 1 || !touch) {
    coordinatorGesture = null;
    return;
  }

  gesture.lastX = touch.clientX;
  gesture.lastY = touch.clientY;
  const deltaX = gesture.lastX - gesture.startX;
  const deltaY = gesture.lastY - gesture.startY;

  if (!gesture.axis && Math.hypot(deltaX, deltaY) >= 16) {
    gesture.axis = deltaX > 0 && Math.abs(deltaX) > Math.abs(deltaY) * gesture.settings.axisRatio ? "x" : "y";
    if (gesture.axis === "y") gesture.cancelled = true;
  }

  if (gesture.axis === "x" && !gesture.cancelled && event.cancelable) event.preventDefault();
}

function handleCoordinatorTouchEnd(event) {
  const gesture = coordinatorGesture;
  coordinatorGesture = null;
  if (!gesture || gesture.cancelled || event.touches?.length) return;

  const touch = event.changedTouches?.[0];
  if (!touch) return;
  const result = classifyBackSwipe({
    deltaX: touch.clientX - gesture.startX,
    deltaY: touch.clientY - gesture.startY,
    elapsedMs: (event.timeStamp || Date.now()) - gesture.startedAt,
    ...gesture.settings,
  });

  if (!result.commit) return;
  suppressNavigationGestures(360);
  gesture.entry.onBackRef.current?.();
}

function handleCoordinatorTouchCancel() {
  coordinatorGesture = null;
}

function startCoordinator() {
  if (coordinatorListening || typeof window === "undefined") return;
  coordinatorListening = true;
  window.addEventListener("touchstart", handleCoordinatorTouchStart, { passive: true });
  window.addEventListener("touchmove", handleCoordinatorTouchMove, { passive: false });
  window.addEventListener("touchend", handleCoordinatorTouchEnd, { passive: true });
  window.addEventListener("touchcancel", handleCoordinatorTouchCancel, { passive: true });
}

function stopCoordinatorIfIdle() {
  if (!coordinatorListening || registeredBackTargets.size) return;
  coordinatorListening = false;
  coordinatorGesture = null;
  window.removeEventListener("touchstart", handleCoordinatorTouchStart);
  window.removeEventListener("touchmove", handleCoordinatorTouchMove);
  window.removeEventListener("touchend", handleCoordinatorTouchEnd);
  window.removeEventListener("touchcancel", handleCoordinatorTouchCancel);
}

export function useBackSwipeRegistration(active, onBack, options = {}) {
  const nodeRef = useRef(null);
  const onBackRef = useRef(onBack);
  const optionsRef = useRef(options);
  onBackRef.current = onBack;
  optionsRef.current = options;

  useEffect(() => {
    if (!active) return undefined;
    const entry = { nodeRef, onBackRef, optionsRef, order: nextRegistrationOrder++ };
    registeredBackTargets.add(entry);
    startCoordinator();
    return () => {
      registeredBackTargets.delete(entry);
      stopCoordinatorIfIdle();
    };
  }, [active]);

  return nodeRef;
}

export function useBackSwipe(active, onBack, options = {}) {
  const hostRef = useRef(null);
  const gestureRef = useRef(null);
  const onBackRef = useRef(onBack);
  const settingsRef = useRef(getSettings(options));
  onBackRef.current = onBack;
  settingsRef.current = getSettings(options);

  useEffect(() => {
    const node = hostRef.current;
    if (!active || !node) return undefined;

    function handleTouchStart(event) {
      const touch = event.touches?.[0];
      const settings = settingsRef.current;
      if (
        event.touches?.length !== 1 ||
        !touch ||
        touch.clientX > settings.edgeWidth ||
        !canStartNavigationGesture(event.target, { allowInActiveLayer: true })
      ) {
        gestureRef.current = null;
        return;
      }

      gestureRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        startedAt: event.timeStamp || Date.now(),
        axis: null,
        cancelled: false,
      };
    }

    function handleTouchMove(event) {
      const gesture = gestureRef.current;
      const touch = event.touches?.[0];
      if (!gesture || event.touches?.length !== 1 || !touch) {
        gestureRef.current = null;
        return;
      }

      gesture.lastX = touch.clientX;
      gesture.lastY = touch.clientY;
      const deltaX = gesture.lastX - gesture.startX;
      const deltaY = gesture.lastY - gesture.startY;
      if (!gesture.axis && Math.hypot(deltaX, deltaY) >= 16) {
        gesture.axis = deltaX > 0 && Math.abs(deltaX) > Math.abs(deltaY) * settingsRef.current.axisRatio ? "x" : "y";
        if (gesture.axis === "y") gesture.cancelled = true;
      }
      if (gesture.axis === "x" && !gesture.cancelled && event.cancelable) event.preventDefault();
    }

    function handleTouchEnd(event) {
      const gesture = gestureRef.current;
      gestureRef.current = null;
      if (!gesture || gesture.cancelled || event.touches?.length) return;
      const touch = event.changedTouches?.[0];
      if (!touch) return;

      const result = classifyBackSwipe({
        deltaX: touch.clientX - gesture.startX,
        deltaY: touch.clientY - gesture.startY,
        elapsedMs: (event.timeStamp || Date.now()) - gesture.startedAt,
        ...settingsRef.current,
      });
      if (result.commit) {
        suppressNavigationGestures(360);
        onBackRef.current?.();
      }
    }

    function handleTouchCancel() {
      gestureRef.current = null;
    }

    node.addEventListener("touchstart", handleTouchStart, { passive: true });
    node.addEventListener("touchmove", handleTouchMove, { passive: false });
    node.addEventListener("touchend", handleTouchEnd, { passive: true });
    node.addEventListener("touchcancel", handleTouchCancel, { passive: true });
    return () => {
      node.removeEventListener("touchstart", handleTouchStart);
      node.removeEventListener("touchmove", handleTouchMove);
      node.removeEventListener("touchend", handleTouchEnd);
      node.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [active]);

  return hostRef;
}
