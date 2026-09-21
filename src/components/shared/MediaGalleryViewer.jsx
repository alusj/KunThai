import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

import { resizedImageUrl } from "../../Backend/lib/imageProxy";
import { useBrowserBack } from "../../Backend/hooks/useBrowserBack";
import useBodyScrollLock from "./useBodyScrollLock";
import useImageViewerGestures from "./useImageViewerGestures";
import { uiText as translateUi, useI18n as useUiLocale } from "../../i18n/index.js";

// The full-screen photo viewer behind every KunThai gallery: UrMall product
// photos, UrRide fleet and operator photos (solo and company) and company
// rentals all open this one, so a photo behaves the same everywhere — it zooms
// open, double-tap or pinch to zoom, drag a zoomed photo, swipe or tap the
// arrows to slide to the next one, and thumbnails jump straight to a photo.
//
// `images` accepts plain URLs or { url, label } entries. `labels` carries the
// already-translated text, so each caller keeps its own wording.
const DEFAULT_LABELS = {
  aria: "Image viewer",
  close: "Close",
  counter: ({ index, total }) => `${index} / ${total}`,
  zoomHint: ({ pct }) => `${pct}%`,
  zoomPrompt: "Double-tap to zoom",
  previous: "Previous image",
  next: "Next image",
  openImage: ({ index, label }) => label || `Open image ${index}`,
};

function normalizeImages(images) {
  return (Array.isArray(images) ? images : [])
    .map((image) => (typeof image === "string" ? { url: image, label: "" } : { url: image?.url || "", label: image?.label || "" }))
    .filter((image) => image.url);
}

function text(value, params) {
  return typeof value === "function" ? value(params) : value;
}

export default function MediaGalleryViewer({
  activeIndex,
  images,
  labels = {},
  onChange,
  onClose,
  backKey = "kt-media-gallery-viewer",
}) {
  useUiLocale();
  const copy = { ...DEFAULT_LABELS, ...labels };
  const items = useMemo(() => normalizeImages(images), [images]);
  const hasMultiple = items.length > 1;
  const open = activeIndex >= 0 && activeIndex < items.length;
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef(null);
  const indexRef = useRef(activeIndex);
  indexRef.current = activeIndex;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      onClose?.();
      setClosing(false);
    }, 220);
  }, [closing, onClose]);

  const move = useCallback((direction) => {
    const total = items.length;
    if (total < 2) return;
    onChangeRef.current?.((indexRef.current + direction + total) % total);
  }, [items.length]);

  const gestures = useImageViewerGestures({
    enabled: open,
    onClose: requestClose,
    onSwipe: hasMultiple ? move : undefined,
    resetKey: activeIndex,
  });
  useBrowserBack(open, requestClose, backKey);
  useBodyScrollLock(open);

  useEffect(() => {
    if (open) setClosing(false);
    return () => window.clearTimeout(closeTimerRef.current);
  }, [activeIndex, open]);

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        requestClose();
        return;
      }
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [move, open, requestClose]);

  if (!open || typeof document === "undefined") return null;

  const current = items[activeIndex];

  return createPortal(
    <div
      className={`${closing ? "kt-media-zoom-exit" : "kt-media-zoom-enter"} kt-mobile-screen fixed inset-0 z-[1500] flex flex-col overflow-hidden bg-slate-950 text-white`}
      role="dialog"
      aria-modal="true"
      aria-label={translateUi(copy.aria)}
      data-suppress-app-swipe="true"
      data-gesture-lock="media-gallery-viewer"
    >
      <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={requestClose}
          className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/35 text-white shadow-xl backdrop-blur-md transition hover:bg-black/55"
          aria-label={translateUi(copy.close)}
        >
          <ArrowLeft size={22} />
        </button>
        <div className="min-w-0 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 shadow-lg backdrop-blur-md">
          {current.label ? <p className="truncate text-xs font-black">{current.label}</p> : null}
          <p className={`text-[11px] font-black ${current.label ? "mt-0.5 text-white/70" : ""}`}>
            {text(copy.counter, { index: activeIndex + 1, total: items.length })}
          </p>
        </div>
        <div className="ml-auto rounded-full border border-white/10 bg-black/30 px-3 py-2 text-[11px] font-bold text-white/80 shadow-lg backdrop-blur-md">
          {gestures.scale > 1 ? text(copy.zoomHint, { pct: Math.round(gestures.scale * 100) }) : text(copy.zoomPrompt, {})}
        </div>
      </header>

      <div
        ref={gestures.viewportRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{ touchAction: "none" }}
        {...gestures.stageHandlers}
      >
        <div
          className="flex h-full transition-transform duration-300 ease-out"
          style={{ transform: `translate3d(-${activeIndex * 100}%, 0, 0)` }}
        >
          {items.map((image, index) => {
            const active = index === activeIndex;
            return (
              <div
                key={`${image.url}-${index}`}
                className="flex h-full w-full shrink-0 items-center justify-center overflow-hidden px-2 py-4 sm:px-4"
              >
                <img
                  ref={active ? gestures.imageRef : undefined}
                  src={image.url}
                  alt={image.label || ""}
                  draggable="false"
                  className={`max-h-full max-w-full select-none object-contain shadow-2xl transition-[transform,opacity] duration-300 ${
                    active ? "opacity-100" : "opacity-50"
                  }`}
                  style={{
                    transform: active
                      ? `translate3d(${gestures.pan.x}px, ${gestures.pan.y}px, 0) scale(${gestures.scale})`
                      : "translate3d(0, 0, 0) scale(1)",
                    transformOrigin: "center",
                    cursor: active && gestures.scale > 1
                      ? gestures.isDragging ? "grabbing" : "grab"
                      : "zoom-in",
                    touchAction: "none",
                    transitionDuration: active && gestures.isDragging ? "0ms" : undefined,
                  }}
                />
              </div>
            );
          })}
        </div>

        {hasMultiple ? (
          <>
            <button
              type="button"
              onClick={() => move(-1)}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              className="absolute left-3 top-1/2 z-20 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/30 text-white shadow-xl backdrop-blur-md transition hover:bg-black/55"
              aria-label={translateUi(copy.previous)}
            >
              <ChevronLeft size={24} />
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              className="absolute right-3 top-1/2 z-20 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/30 text-white shadow-xl backdrop-blur-md transition hover:bg-black/55"
              aria-label={translateUi(copy.next)}
            >
              <ChevronRight size={24} />
            </button>
          </>
        ) : null}
      </div>

      {hasMultiple ? (
        <div className="relative z-20 border-t border-white/10 bg-black/25 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-md">
          <div className="flex justify-center gap-2 overflow-x-auto pb-1">
            {items.map((image, index) => (
              <button
                key={`${image.url}-thumb-${index}`}
                type="button"
                onClick={() => index !== activeIndex && onChange?.(index)}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                  index === activeIndex ? "border-white shadow-lg" : "border-white/20 opacity-70"
                }`}
                aria-label={text(copy.openImage, { index: index + 1, label: image.label })}
              >
                <img src={resizedImageUrl(image.url, { width: 160, quality: 70 })} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
