import { useCallback, useEffect, useRef, useState } from "react";

const DOUBLE_TAP_MS = 280;
const DRAG_THRESHOLD_PX = 7;
const SWIPE_THRESHOLD_PX = 48;

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
}) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const viewportRef = useRef(null);
  const imageRef = useRef(null);
  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
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
    setIsDragging(false);
  }, [updatePan, updateScale]);

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

    if (scaleRef.current > 1) {
      event.preventDefault();
      setIsDragging(true);
      updatePan(constrainPan({
        x: gesture.startPan.x + deltaX,
        y: gesture.startPan.y + deltaY,
      }));
    }
  }, [constrainPan, updatePan]);

  const handlePointerUp = useCallback((event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (
      scaleRef.current === 1 &&
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
    singleTapTimerRef.current = window.setTimeout(() => {
      lastTapRef.current = 0;
      onCloseRef.current?.();
    }, DOUBLE_TAP_MS + 20);
  }, [toggleZoomAt]);

  const handlePointerCancel = useCallback(() => {
    gestureRef.current = null;
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((event) => {
    if (!enabled) return;
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? -0.2 : 0.2);
  }, [enabled, zoomBy]);

  return {
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
