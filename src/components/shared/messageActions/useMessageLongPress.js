import { useEffect, useRef, useState } from "react";

const HOLD_MS = 450;
// A finger that drifts further than this is scrolling, not holding.
const MOVE_TOLERANCE_PX = 10;

// Tap-and-hold on a chat bubble. Returns props to spread on the bubble; the
// callback gets the bubble element once the hold completes. A right click
// (desktop) opens it too. The click that ends a hold is swallowed, so holding
// a photo or a voice note's play button does not also open or play it.
export function useMessageLongPress(onLongPress, { disabled = false } = {}) {
  const [pressing, setPressing] = useState(false);
  const timerRef = useRef(null);
  const startRef = useRef(null);
  const firedRef = useRef(false);
  const callbackRef = useRef(onLongPress);
  callbackRef.current = onLongPress;

  function clear() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    startRef.current = null;
    setPressing(false);
  }

  useEffect(() => clear, []);

  function fire(element) {
    if (firedRef.current) return;
    firedRef.current = true;
    clear();
    callbackRef.current?.(element);
  }

  if (disabled) return { pressing: false, handlers: {} };

  return {
    pressing,
    handlers: {
      onPointerDown(event) {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        firedRef.current = false;
        const element = event.currentTarget;
        startRef.current = { x: event.clientX, y: event.clientY };
        setPressing(true);
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => fire(element), HOLD_MS);
      },
      onPointerMove(event) {
        const start = startRef.current;
        if (!start) return;
        if (Math.abs(event.clientX - start.x) > MOVE_TOLERANCE_PX || Math.abs(event.clientY - start.y) > MOVE_TOLERANCE_PX) clear();
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
      onContextMenu(event) {
        event.preventDefault();
        fire(event.currentTarget);
      },
      onClickCapture(event) {
        if (!firedRef.current) return;
        firedRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
    },
  };
}
