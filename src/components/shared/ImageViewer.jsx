import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, X } from "lucide-react";

// A premium full-screen image viewer (lightbox). Tap to open from a message
// bubble; pinch or double-tap to zoom, drag to pan when zoomed, swipe down or
// tap the backdrop to close, and save the original with one tap. Self-contained
// and reusable — used by UrFeed and UrMall messaging.
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

export default function ImageViewer({ src, alt = "", onClose }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const lastTapRef = useRef(0);
  const imgRef = useRef(null);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function handlePointerDown(event) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    if (points.length === 2) {
      gesture.current = {
        type: "pinch",
        startDist: distance(points[0], points[1]),
        startScale: scale,
        startOffset: { ...offset },
        startMid: midpoint(points[0], points[1]),
      };
    } else if (points.length === 1) {
      gesture.current = { type: "pan", startX: event.clientX, startY: event.clientY, startOffset: { ...offset } };
    }
  }

  function handlePointerMove(event) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    const g = gesture.current;
    if (!g) return;

    if (g.type === "pinch" && points.length >= 2) {
      const nextScale = Math.min(MAX_SCALE, Math.max(1, (g.startScale * distance(points[0], points[1])) / g.startDist));
      const mid = midpoint(points[0], points[1]);
      setScale(nextScale);
      setOffset({
        x: g.startOffset.x + (mid.x - g.startMid.x),
        y: g.startOffset.y + (mid.y - g.startMid.y),
      });
    } else if (g.type === "pan" && points.length === 1) {
      const dx = event.clientX - g.startX;
      const dy = event.clientY - g.startY;
      if (scale > 1) {
        setOffset({ x: g.startOffset.x + dx, y: g.startOffset.y + dy });
      } else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) {
        // Swipe down to dismiss when not zoomed.
        onClose?.();
      }
    }
  }

  function handlePointerUp(event) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
    if (scale < 1.05) reset();
  }

  function handleDoubleTap(event) {
    event.stopPropagation();
    if (scale > 1) {
      reset();
    } else {
      setScale(DOUBLE_TAP_SCALE);
    }
  }

  function handleImageTap(event) {
    event.stopPropagation();
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      handleDoubleTap(event);
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
  }

  function handleWheel(event) {
    event.preventDefault();
    const next = Math.min(MAX_SCALE, Math.max(1, scale - event.deltaY * 0.002));
    setScale(next);
    if (next <= 1.02) setOffset({ x: 0, y: 0 });
  }

  async function download(event) {
    event.stopPropagation();
    setDownloading(true);
    try {
      const response = await fetch(src, { mode: "cors" });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `kunthai-image-${Date.now()}.${(blob.type.split("/")[1] || "jpg").split("+")[0]}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in a new tab so the user can still save it.
      window.open(src, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  }

  if (typeof document === "undefined" || !src) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/92 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Image"}
      onClick={() => onClose?.()}
    >
      <div className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] flex gap-2">
        <button
          type="button"
          onClick={download}
          disabled={downloading || failed}
          aria-label="Save image"
          className="grid h-11 w-11 place-items-center rounded-full bg-white/12 text-white backdrop-blur transition hover:bg-white/25 disabled:opacity-50"
        >
          {downloading ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
        </button>
        <button
          type="button"
          onClick={() => onClose?.()}
          aria-label="Close"
          className="grid h-11 w-11 place-items-center rounded-full bg-white/12 text-white backdrop-blur transition hover:bg-white/25"
        >
          <X size={22} />
        </button>
      </div>

      {!loaded && !failed ? (
        <Loader2 size={34} className="absolute animate-spin text-white/80" aria-label="Loading image" />
      ) : null}

      {failed ? (
        <div className="px-8 text-center text-sm font-semibold text-white/80">
          This image couldn’t be loaded. Check your connection and try again.
        </div>
      ) : (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          onClick={handleImageTap}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          draggable={false}
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
            transition: pointers.current.size ? "none" : "transform .22s ease-out",
            touchAction: "none",
            cursor: scale > 1 ? "grab" : "auto",
          }}
          className={`max-h-[90vh] max-w-[94vw] select-none rounded-lg object-contain transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>,
    document.body,
  );
}
