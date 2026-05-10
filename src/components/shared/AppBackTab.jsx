import { useCallback, useEffect, useRef } from "react";
import { ChevronLeft } from "lucide-react";

import { useBrowserBack } from "../../Backend/hooks/useBrowserBack";

const SWIPE_DEFAULTS = {
  edgeWidth: 180,
  minDistance: 64,
  maxVerticalDrift: 80,
};

function isFormControl(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
}

function useBackTabSwipe(active, onBack, options = {}) {
  const gestureRef = useRef(null);
  const onBackRef = useRef(onBack);
  const settings = { ...SWIPE_DEFAULTS, ...options };

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!active || typeof window === "undefined") {
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

      if (horizontalIntent) {
        event.preventDefault();
      }
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

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [active, settings.edgeWidth, settings.maxVerticalDrift, settings.minDistance]);
}

export default function AppBackTab({
  onBack,
  label = "Back",
  historyKey = "kuntai-screen",
  className = "",
  iconSize = 36,
  useHistoryLayer = true,
  enableSwipe = true,
  swipeOptions,
  style,
}) {
  const goBack = useBrowserBack(Boolean(onBack && useHistoryLayer), onBack, historyKey);
  const handleBack = useCallback(() => {
    if (useHistoryLayer) {
      goBack?.();
      return;
    }

    onBack?.();
  }, [goBack, onBack, useHistoryLayer]);

  const handleSwipeBack = useCallback(() => {
    onBack?.();
  }, [onBack]);

  useBackTabSwipe(Boolean(onBack && enableSwipe), handleSwipeBack, swipeOptions);

  if (!onBack) return null;

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label={label}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-none bg-transparent text-black transition hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black ${className}`}
      style={{ backgroundColor: "transparent", borderColor: "transparent", borderRadius: 0, ...style }}
    >
      <ChevronLeft size={iconSize} strokeWidth={4.5} absoluteStrokeWidth aria-hidden="true" />
    </button>
  );
}
