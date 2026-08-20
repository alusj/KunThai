import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HiOutlineArrowLeft, HiOutlineArrowPath, HiOutlinePhoto } from "react-icons/hi2";

import { resizedImageUrl } from "../../../Backend/lib/imageProxy";
import { useBrowserBack } from "../../../Backend/hooks/useBrowserBack";
import { useI18n } from "../../../i18n";
import useImageViewerGestures from "../../shared/useImageViewerGestures";
import { t as i18nText } from "../../../i18n/index";

// Keep the portal mounted slightly longer than the CSS shared-image transition.
// Unmounting at 340ms while the 360ms zoom-back is still running cuts the final
// frame and exposes the feed's scroll-lock correction underneath.
const VIEWER_TRANSITION_MS = 390;

function getContainedImageRect(image) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = Math.min(16, Math.max(8, viewportWidth * 0.025));
  const availableWidth = Math.max(1, viewportWidth - margin * 2);
  const availableHeight = Math.max(1, viewportHeight - margin * 2);
  const naturalWidth = Math.max(1, Number(image?.naturalWidth || availableWidth));
  const naturalHeight = Math.max(1, Number(image?.naturalHeight || availableHeight));
  const scale = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;

  return {
    left: (viewportWidth - width) / 2,
    top: (viewportHeight - height) / 2,
    width,
    height,
  };
}

function readElementRect(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

// A reusable full-screen image viewer with the shared-element zoom transition,
// pinch/pan gestures and swipe-down-to-dismiss. Tapping the thumbnail lifts the
// image into a portal viewer; the reader dismisses it by pulling it back toward
// the feed (or with the back button), so it never blocks the surrounding UI.
//
// `interactive` opts out of the viewer entirely (e.g. composer previews) and
// renders the plain thumbnail. Class-name props let each surface keep its own
// framing while sharing one viewer.
export default function ZoomableImage({
  src,
  alt = "",
  interactive = true,
  eager = false,
  idKey = "zoomable-image",
  wrapperClassName = "max-w-full overflow-hidden px-4 pb-4",
  buttonClassName = "kt-pressable relative block aspect-[4/3] w-full overflow-hidden rounded-[20px] bg-slate-100 text-left",
  imgClassName = "h-full max-h-[520px] w-full max-w-full object-cover",
  restRadius = 20,
}) {
  const { t } = useI18n();
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [viewerPhase, setViewerPhase] = useState("closed");
  const [viewerOrigin, setViewerOrigin] = useState(null);
  const [viewerTarget, setViewerTarget] = useState(null);
  const [imageStatus, setImageStatus] = useState(src ? "loading" : "idle");
  const [imageRetryKey, setImageRetryKey] = useState(0);
  const thumbnailButtonRef = useRef(null);
  const thumbnailImageRef = useRef(null);
  const viewerTimerRef = useRef(null);
  const viewerFrameRef = useRef(null);
  const viewerSecondFrameRef = useRef(null);

  const closeImagePreview = useCallback(() => {
    if (!imagePreviewOpen || viewerPhase === "exiting") return;

    window.clearTimeout(viewerTimerRef.current);
    setViewerPhase("exiting");
    viewerTimerRef.current = window.setTimeout(() => {
      setImagePreviewOpen(false);
      setViewerPhase("closed");
      setViewerOrigin(null);
      setViewerTarget(null);
    }, VIEWER_TRANSITION_MS);
  }, [imagePreviewOpen, viewerPhase]);

  const viewerGestures = useImageViewerGestures({
    enabled: imagePreviewOpen && viewerPhase === "open",
    onClose: closeImagePreview,
    resetKey: src,
    // A plain tap should never close the viewer — the reader dismisses it by
    // pulling the image down toward the feed (or with the back button).
    tapToClose: false,
    dismissible: true,
  });

  useBrowserBack(imagePreviewOpen, closeImagePreview, `image-preview-${idKey}`);

  useEffect(() => () => {
    window.clearTimeout(viewerTimerRef.current);
    window.cancelAnimationFrame(viewerFrameRef.current);
    window.cancelAnimationFrame(viewerSecondFrameRef.current);
  }, []);

  useEffect(() => {
    setImageStatus(src ? "loading" : "idle");
    setImageRetryKey(0);
    setImagePreviewOpen(false);
    setViewerPhase("closed");
  }, [src]);

  useLayoutEffect(() => {
    if (!imagePreviewOpen || viewerPhase !== "entering") return undefined;

    viewerFrameRef.current = window.requestAnimationFrame(() => {
      viewerSecondFrameRef.current = window.requestAnimationFrame(() => setViewerPhase("open"));
    });

    return () => {
      window.cancelAnimationFrame(viewerFrameRef.current);
      window.cancelAnimationFrame(viewerSecondFrameRef.current);
    };
  }, [imagePreviewOpen, viewerPhase]);

  useEffect(() => {
    if (!imagePreviewOpen) return undefined;

    function updateViewerTarget() {
      setViewerTarget(getContainedImageRect(thumbnailImageRef.current));
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") closeImagePreview();
    }

    window.addEventListener("resize", updateViewerTarget);
    window.addEventListener("orientationchange", updateViewerTarget);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", updateViewerTarget);
      window.removeEventListener("orientationchange", updateViewerTarget);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeImagePreview, imagePreviewOpen]);

  function openImagePreview() {
    if (!interactive || imageStatus !== "loaded" || !thumbnailButtonRef.current || !thumbnailImageRef.current) return;

    const origin = readElementRect(thumbnailButtonRef.current);
    if (!origin) return;

    window.clearTimeout(viewerTimerRef.current);
    setViewerOrigin(origin);
    setViewerTarget(getContainedImageRect(thumbnailImageRef.current));
    setViewerPhase("entering");
    setImagePreviewOpen(true);
  }

  if (!src) return null;

  return (
    <>
      <div className={wrapperClassName}>
        {imageStatus === "error" ? (
          <MediaFallback
            label={t("explore.mediaUnavailable")}
            onRetry={() => {
              setImageStatus("loading");
              setImageRetryKey((value) => value + 1);
            }}
          />
        ) : (
          <button
            ref={thumbnailButtonRef}
            type="button"
            onClick={openImagePreview}
            disabled={!interactive}
            className={`${buttonClassName} ${imagePreviewOpen ? "opacity-0" : "opacity-100"}`}
            aria-label={t("post.previewImage")}
            aria-hidden={imagePreviewOpen}
          >
            {imageStatus !== "loaded" ? <MediaSkeleton /> : null}
            <img
              ref={thumbnailImageRef}
              key={`${src}-${imageRetryKey}`}
              loading={eager ? "eager" : "lazy"}
              fetchpriority={eager ? "high" : "auto"}
              src={resizedImageUrl(src, { width: 720, quality: 72 })}
              alt={alt}
              onLoad={() => setImageStatus("loaded")}
              onError={() => setImageStatus("error")}
              className={`${imgClassName} transition-opacity duration-200 ${
                imageStatus === "loaded" ? "opacity-100" : "opacity-0"
              }`}
            />
          </button>
        )}
      </div>

      {imagePreviewOpen && imageStatus === "loaded" && viewerOrigin && viewerTarget
        ? createPortal(
            <div
              ref={viewerGestures.viewportRef}
              className="fixed inset-0 z-[1200] h-dvh w-full overflow-hidden overscroll-none [contain:strict]"
              role="dialog"
              aria-modal="true"
              aria-label={t("post.fullScreenViewer")}
              style={{ touchAction: "none" }}
              // The viewer drives itself with pointer events; swallow the parallel
              // touch events so panning a zoomed image never bubbles up to the
              // Explore tab/drawer swipe.
              onTouchStart={(event) => event.stopPropagation()}
              onTouchMove={(event) => event.stopPropagation()}
              onTouchEnd={(event) => event.stopPropagation()}
              {...viewerGestures.stageHandlers}
            >
              <div
                className="kt-image-viewer-backdrop absolute inset-0 h-full w-full bg-slate-950"
                style={{
                  opacity: viewerPhase === "open" ? 0.96 * (1 - viewerGestures.dismissProgress) : 0,
                  transitionDuration: viewerGestures.isDragging ? "0ms" : undefined,
                }}
                aria-hidden="true"
              />

              <div
                className="kt-image-viewer-controls pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white"
                style={{
                  opacity: viewerPhase === "open" ? 1 - viewerGestures.dismissProgress : 0,
                  transitionDuration: viewerGestures.isDragging ? "0ms" : undefined,
                }}
              >
                <button
                  type="button"
                  onClick={closeImagePreview}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                  className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/35 text-2xl text-white shadow-xl backdrop-blur-md"
                  aria-label={t("post.backToFeed")}
                >
                  <HiOutlineArrowLeft />
                </button>
              </div>

              <img
                ref={viewerGestures.imageRef}
                src={src}
                alt={alt}
                draggable="false"
                onError={() => {
                  setImageStatus("error");
                  closeImagePreview();
                }}
                className="kt-image-viewer-shared fixed z-10 select-none object-contain shadow-2xl [backface-visibility:hidden]"
                style={{
                  left: `${(viewerPhase === "open" ? viewerTarget : viewerOrigin).left}px`,
                  top: `${(viewerPhase === "open" ? viewerTarget : viewerOrigin).top}px`,
                  width: `${(viewerPhase === "open" ? viewerTarget : viewerOrigin).width}px`,
                  height: `${(viewerPhase === "open" ? viewerTarget : viewerOrigin).height}px`,
                  borderRadius: viewerPhase === "open" ? `${viewerGestures.dismissProgress * 24}px` : `${restRadius}px`,
                  transform: viewerPhase === "open"
                    ? `translate3d(${viewerGestures.pan.x + viewerGestures.dragOffset.x}px, ${viewerGestures.pan.y + viewerGestures.dragOffset.y}px, 0) scale(${viewerGestures.scale * (1 - viewerGestures.dismissProgress * 0.12)})`
                    : "translate3d(0, 0, 0) scale(1)",
                  transformOrigin: "center",
                  cursor: viewerGestures.scale > 1
                    ? viewerGestures.isDragging ? "grabbing" : "grab"
                    : "zoom-in",
                  touchAction: "none",
                  transitionDuration: viewerGestures.isDragging ? "0ms" : undefined,
                }}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function MediaSkeleton({ dark = false }) {
  return (
    <div className={`absolute inset-0 flex items-center justify-center overflow-hidden ${dark ? "bg-slate-900" : "bg-slate-100"}`}>
      <div className={`absolute inset-0 animate-pulse ${dark ? "bg-slate-800" : "bg-slate-200"}`} />
      <div className={`relative grid h-14 w-14 place-items-center rounded-2xl ${dark ? "bg-white/10 text-white/70" : "bg-white text-slate-400"} shadow-sm`}>
        <HiOutlinePhoto className="text-2xl" />
      </div>
    </div>
  );
}

function MediaFallback({ label, onRetry }) {
  return (
    <div className="flex aspect-[4/3] w-full flex-col items-center justify-center rounded-[20px] border border-slate-200 bg-slate-50 px-4 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm">
        <HiOutlinePhoto className="text-2xl" />
      </span>
      <p className="mt-3 text-sm font-black text-slate-900">{label}</p>
      <button
        type="button"
        onClick={onRetry}
        className="kt-pressable mt-3 inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-black text-slate-700"
      >
        <HiOutlineArrowPath />
        {i18nText("ui.literals.k9f5cd8a2e880")}
      </button>
    </div>
  );
}
