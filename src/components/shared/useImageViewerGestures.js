import { useCallback, useEffect, useRef, useState } from "react";

const DOUBLE_TAP_MS = 280;
const DRAG_THRESHOLD_PX = 7;
const SWIPE_THRESHOLD_PX = 48;
// How far a downward drag must travel (or fling) before releasing dismisses
// the viewer and returns to the feed.
const DISMISS_CLOSE_PX = 120;
const DISMISS_FLING_VELOCITY = 0.6; // px per ms

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function useImageViewerGestures({
  enabled,
  onClose,
  onSwipe,
  resetKey,
  zoomScale = 2.5,
  maxScale = 3,
  // Feed viewer opts out of tap-to-close (a plain tap should do nothing) and
  // into swipe-down-to-dismiss. The marketplace viewer keeps the old defaults.
  tapToClose = true,
  dismissible = false,
}) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const viewportRef = useRef(null);
  const imageRef = useRef(null);
  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const gestureRef = useRef(null);
  const lastTapRef = useRef(0);
  const singleTapTimerRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const onSwipeRef = useRef(onSwipe);

  useEffect(() => {
    onCloseRef.current = onClose;
    onSwipeRef.current = onSwipe;
  }, [onClose, onSwipe]);

  const updatePan = useCallback((nextPan) => {
    panRef.current = nextPan;
    setPan(nextPan);
  }, []);

  const updateScale = useCallback((nextScale) => {
    scaleRef.current = nextScale;
    setScale(nextScale);
  }, []);

  const updateDrag = useCallback((nextDrag) => {
    dragOffsetRef.current = nextDrag;
    setDragOffset(nextDrag);
  }, []);

  const constrainPan = useCallback((nextPan, nextScale = scaleRef.current) => {
    const viewport = viewportRef.current;
    const image = imageRef.current;
    if (!viewport || !image || nextScale <= 1) return { x: 0, y: 0 };

    const viewportWidth = viewport.clientWidth || window.innerWidth;
    const viewportHeight = viewport.clientHeight || window.innerHeight;
    const imageWidth = image.offsetWidth || viewportWidth;
    const imageHeight = image.offsetHeight || viewportHeight;
    const maxX = Math.max(0, (imageWidth * nextScale - viewportWidth) / 2);
    const maxY = Math.max(0, (imageHeight * nextScale - viewportHeight) / 2);

    return {
      x: clamp(nextPan.x, -maxX, maxX),
      y: clamp(nextPan.y, -maxY, maxY),
    };
  }, []);

  const resetTransform = useCallback(() => {
    window.clearTimeout(singleTapTimerRef.current);
    lastTapRef.current = 0;
    gestureRef.current = null;
    updateScale(1);
    updatePan({ x: 0, y: 0 });
    updateDrag({ x: 0, y: 0 });
    setIsDragging(false);
  }, [updateDrag, updatePan, updateScale]);

  useEffect(() => {
    resetTransform();
  }, [enabled, resetKey, resetTransform]);

  useEffect(() => () => window.clearTimeout(singleTapTimerRef.current), []);

  const toggleZoomAt = useCallback((clientX, clientY) => {
    if (scaleRef.current > 1) {
      updateScale(1);
      updatePan({ x: 0, y: 0 });
      return;
    }

    const image = imageRef.current;
    const nextScale = Math.min(maxScale, zoomScale);
    let nextPan = { x: 0, y: 0 };
    if (image) {
      const rect = image.getBoundingClientRect();
      const offsetX = clientX - (rect.left + rect.width / 2);
      const offsetY = clientY - (rect.top + rect.height / 2);
      nextPan = constrainPan({
        x: -offsetX * (nextScale - 1),
        y: -offsetY * (nextScale - 1),
      }, nextScale);
    }
    updateScale(nextScale);
    updatePan(nextPan);
  }, [constrainPan, maxScale, updatePan, updateScale, zoomScale]);

  const zoomBy = useCallback((delta) => {
    const nextScale = clamp(Number((scaleRef.current + delta).toFixed(2)), 1, maxScale);
    updateScale(nextScale);
    updatePan(nextScale === 1 ? { x: 0, y: 0 } : constrainPan(panRef.current, nextScale));
  }, [constrainPan, maxScale, updatePan, updateScale]);

  const handlePointerDown = useCallback((event) => {
    if (!enabled || (event.pointerType === "mouse" && event.button !== 0)) return;
    window.clearTimeout(singleTapTimerRef.current);
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPan: panRef.current,
      lastY: event.clientY,
      lastTime: event.timeStamp || Date.now(),
      velocityY: 0,
      axis: null,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [enabled]);

  const handlePointerMove = useCallback((event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD_PX) gesture.moved = true;

    // Panning a zoomed-in image always wins over dismiss/swipe handling.
    if (scaleRef.current > 1) {
      event.preventDefault();
      setIsDragging(true);
      updatePan(constrainPan({
        x: gesture.startPan.x + deltaX,
        y: gesture.startPan.y + deltaY,
      }));
      return;
    }

    if (!dismissible) return;

    // Lock to an axis once the finger clearly commits to a direction so a
    // downward pull dismisses while a sideways swipe can still page galleries.
    if (!gesture.axis && Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD_PX) {
      gesture.axis = Math.abs(deltaY) > Math.abs(deltaX) ? "y" : "x";
    }

    if (gesture.axis === "y") {
      event.preventDefault();
      setIsDragging(true);
      const now = event.timeStamp || Date.now();
      const dt = now - gesture.lastTime;
      if (dt > 0) gesture.velocityY = (event.clientY - gesture.lastY) / dt;
      gesture.lastY = event.clientY;
      gesture.lastTime = now;
      // Follow the finger downward freely; add resistance to upward pulls so
      // the image feels anchored rather than flying off the top.
      const followY = deltaY >= 0 ? deltaY : deltaY * 0.35;
      updateDrag({ x: deltaX * 0.2, y: followY });
    }
  }, [constrainPan, dismissible, updateDrag, updatePan]);

  const handlePointerUp = useCallback((event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;

    // Swipe-down-to-dismiss: release past the threshold, or on a downward
    // fling, returns to the feed; otherwise the image springs back.
    if (dismissible && gesture.axis === "y") {
      const shouldClose =
        dragOffsetRef.current.y > DISMISS_CLOSE_PX ||
        (gesture.velocityY > DISMISS_FLING_VELOCITY && dragOffsetRef.current.y > 24);
      if (shouldClose) {
        lastTapRef.current = 0;
        onCloseRef.current?.();
      } else {
        updateDrag({ x: 0, y: 0 });
      }
      return;
    }

    if (
      scaleRef.current === 1 &&
      gesture.axis !== "y" &&
      Math.abs(deltaX) >= SWIPE_THRESHOLD_PX &&
      Math.abs(deltaX) > Math.abs(deltaY) &&
      onSwipeRef.current
    ) {
      lastTapRef.current = 0;
      onSwipeRef.current(deltaX > 0 ? -1 : 1);
      return;
    }
    if (gesture.moved) return;

    const now = Date.now();
    if (lastTapRef.current && now - lastTapRef.current <= DOUBLE_TAP_MS) {
      window.clearTimeout(singleTapTimerRef.current);
      lastTapRef.current = 0;
      event.preventDefault();
      toggleZoomAt(event.clientX, event.clientY);
      return;
    }

    lastTapRef.current = now;
    if (tapToClose) {
      singleTapTimerRef.current = window.setTimeout(() => {
        lastTapRef.current = 0;
        onCloseRef.current?.();
      }, DOUBLE_TAP_MS + 20);
    }
  }, [dismissible, tapToClose, toggleZoomAt, updateDrag]);

  const handlePointerCancel = useCallback(() => {
    gestureRef.current = null;
    setIsDragging(false);
    if (dismissible) updateDrag({ x: 0, y: 0 });
  }, [dismissible, updateDrag]);

  const handleWheel = useCallback((event) => {
    if (!enabled) return;
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? -0.2 : 0.2);
  }, [enabled, zoomBy]);

  // Fraction of the way to a full dismiss (0 → 1), used to fade the backdrop
  // and gently shrink the image as it is pulled away.
  const dismissProgress = dismissible
    ? clamp(dragOffset.y / (DISMISS_CLOSE_PX * 2), 0, 1)
    : 0;

  return {
    dismissProgress,
    dragOffset,
    imageRef,
    isDragging,
    pan,
    resetTransform,
    scale,
    stageHandlers: {
      onPointerCancel: handlePointerCancel,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onWheel: handleWheel,
    },
    viewportRef,
    zoomBy,
  };
}
