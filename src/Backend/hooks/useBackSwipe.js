import { useEffect, useRef } from "react";

const DEFAULTS = {
  edgeWidth: 180,
  minDistance: 64,
  maxVerticalDrift: 80,
};

function isFormControl(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
}

export function useBackSwipe(active, onBack, options = {}) {
  const hostRef = useRef(null);
  const gestureRef = useRef(null);
  const onBackRef = useRef(onBack);
  const settings = { ...DEFAULTS, ...options };

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    const node = hostRef.current;

    if (!active || !node) {
      return undefined;
    }

    function handleTouchStart(event) {
      const touch = event.touches?.[0];

      if (!touch || isFormControl(event.target) || touch.clientX > settings.edgeWidth) {
        gestureRef.current = null;
        return;
      }

      gestureRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        tracking: true,
        locked: false,
      };
    }

    function handleTouchMove(event) {
      const gesture = gestureRef.current;
      const touch = event.touches?.[0];

      if (!gesture?.tracking || !touch) {
        return;
      }

      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      const horizontalIntent = Math.abs(deltaX) > 16 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2;

      if (!horizontalIntent) {
        return;
      }

      gesture.locked = true;
      event.preventDefault();
    }

    function handleTouchEnd(event) {
      const gesture = gestureRef.current;
      gestureRef.current = null;

      if (!gesture?.tracking) {
        return;
      }

      const touch = event.changedTouches?.[0];

      if (!touch) {
        return;
      }

      const deltaX = touch.clientX - gesture.startX;
      const deltaY = Math.abs(touch.clientY - gesture.startY);

      if (deltaX >= settings.minDistance && deltaY <= settings.maxVerticalDrift) {
        onBackRef.current?.();
      }
    }

    node.addEventListener("touchstart", handleTouchStart, { passive: true });
    node.addEventListener("touchmove", handleTouchMove, { passive: false });
    node.addEventListener("touchend", handleTouchEnd, { passive: true });
    node.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      node.removeEventListener("touchstart", handleTouchStart);
      node.removeEventListener("touchmove", handleTouchMove);
      node.removeEventListener("touchend", handleTouchEnd);
      node.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [active, settings.edgeWidth, settings.maxVerticalDrift, settings.minDistance]);

  return hostRef;
}
