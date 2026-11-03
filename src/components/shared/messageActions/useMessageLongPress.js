import { useEffect, useRef, useState } from "react";

const HOLD_MS = 450;
// A finger that drifts further than this is scrolling, not holding.
const MOVE_TOLERANCE_PX = 10;

// Tap-and-hold on a chat bubble or photo. Returns props to spread on it; the
// callback gets the element and the point pressed ({ x, y }) once the hold
// completes. A second finger (a pinch) cancels the hold. A right click
// (desktop) opens it too. The click that ends a hold is swallowed, so holding
// a photo or a voice note's play button does not also open or play it.
export function useMessageLongPress(onLongPress, { disabled = false } = {}) {
  const [pressing, setPressing] = useState(false);
  const timerRef = useRef(null);
  const startRef = useRef(null);
  const firedRef = useRef(false);
  const fingersRef = useRef(new Set());
  const callbackRef = useRef(onLongPress);
  callbackRef.current = onLongPress;

  function clear() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    startRef.current = null;
    setPressing(false);
  }

  useEffect(() => clear, []);

  function fire(element, point) {
    if (firedRef.current) return;
    firedRef.current = true;
    clear();
    callbackRef.current?.(element, point);
  }

  function lift(event) {
    fingersRef.current.delete(event.pointerId);
    // A photo viewer would read the lift that ends a hold as a tap (and close
    // or zoom): mark it so combineHandlers hands the viewer a cancel instead.
    if (firedRef.current && event?.nativeEvent) event.nativeEvent.ktLongPressLift = true;
    clear();
  }

  if (disabled) return { pressing: false, handlers: {} };

  return {
    pressing,
    handlers: {
      onPointerDown(event) {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        firedRef.current = false;
        fingersRef.current.add(event.pointerId);
        if (fingersRef.current.size > 1) {
          clear();
          return;
        }
        const element = event.currentTarget;
        const point = { x: event.clientX, y: event.clientY };
        startRef.current = point;
        setPressing(true);
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => fire(element, point), HOLD_MS);
      },
      onPointerMove(event) {
        const start = startRef.current;
        if (!start) return;
        if (Math.abs(event.clientX - start.x) > MOVE_TOLERANCE_PX || Math.abs(event.clientY - start.y) > MOVE_TOLERANCE_PX) clear();
      },
      onPointerUp: lift,
      onPointerCancel: lift,
      onPointerLeave: lift,
      onContextMenu(event) {
        event.preventDefault();
        fire(event.currentTarget, { x: event.clientX, y: event.clientY });
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
