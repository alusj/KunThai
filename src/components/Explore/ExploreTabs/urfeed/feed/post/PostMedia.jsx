import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HiOutlineArrowLeft, HiOutlineArrowPath, HiOutlinePhoto } from "react-icons/hi2";

import { useBrowserBack } from "../../../../../../Backend/hooks/useBrowserBack";
import { pauseOtherExploreMedia, stopAllExploreMedia } from "../../../../shared/singleMediaPlayback";
import { isAdvertPost } from "../../../../shared/advertUtils";
import useBodyScrollLock from "../../../../../shared/useBodyScrollLock";
import useImageViewerGestures from "../../../../../shared/useImageViewerGestures";

const VIEWER_TRANSITION_MS = 340;

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

export default function PostMedia({ post, imageOnly = false }) {
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [viewerPhase, setViewerPhase] = useState("closed");
  const [viewerOrigin, setViewerOrigin] = useState(null);
  const [viewerTarget, setViewerTarget] = useState(null);
  const [imageStatus, setImageStatus] = useState(post.image_url ? "loading" : "idle");
  const [videoStatus, setVideoStatus] = useState(post.video_url ? "loading" : "idle");
  const [imageRetryKey, setImageRetryKey] = useState(0);
  const [videoRetryKey, setVideoRetryKey] = useState(0);
  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const thumbnailButtonRef = useRef(null);
  const thumbnailImageRef = useRef(null);
  const viewerTimerRef = useRef(null);
  const viewerFrameRef = useRef(null);
  const viewerSecondFrameRef = useRef(null);
  const advertPost = isAdvertPost(post);

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
    resetKey: post.image_url,
  });

  useBrowserBack(imagePreviewOpen, closeImagePreview, `image-preview-${post.id}`);
  useBodyScrollLock(imagePreviewOpen);

  useEffect(() => () => {
    stopAllExploreMedia();
    window.clearTimeout(viewerTimerRef.current);
    window.cancelAnimationFrame(viewerFrameRef.current);
    window.cancelAnimationFrame(viewerSecondFrameRef.current);
  }, []);

  useEffect(() => {
    setImageStatus(post.image_url ? "loading" : "idle");
    setImageRetryKey(0);
    setImagePreviewOpen(false);
    setViewerPhase("closed");
  }, [post.image_url]);

  useEffect(() => {
    setVideoStatus(post.video_url ? "loading" : "idle");
    setVideoRetryKey(0);
  }, [post.video_url]);

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
    if (imageStatus !== "loaded" || !thumbnailButtonRef.current || !thumbnailImageRef.current) return;

    const origin = readElementRect(thumbnailButtonRef.current);
    if (!origin) return;

    window.clearTimeout(viewerTimerRef.current);
    setViewerOrigin(origin);
    setViewerTarget(getContainedImageRect(thumbnailImageRef.current));
    setViewerPhase("entering");
    setImagePreviewOpen(true);
  }

  return (
    <>
      {post.image_url ? (
        <div className="max-w-full overflow-hidden px-4 pb-4">
          {imageStatus === "error" ? (
            <MediaFallback
              label="Media unavailable"
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
              className={`kt-pressable relative block aspect-[4/3] w-full overflow-hidden rounded-[20px] bg-slate-100 text-left ${
                imagePreviewOpen ? "opacity-0" : "opacity-100"
              }`}
              aria-label="Preview image"
              aria-hidden={imagePreviewOpen}
            >
              {imageStatus !== "loaded" ? <MediaSkeleton /> : null}
              <img
                ref={thumbnailImageRef}
                key={`${post.image_url}-${imageRetryKey}`}
                loading={advertPost ? "eager" : "lazy"}
                fetchpriority={advertPost ? "high" : "auto"}
                src={post.image_url}
                alt=""
                onLoad={() => setImageStatus("loaded")}
                onError={() => setImageStatus("error")}
                className={`h-full max-h-[520px] w-full max-w-full object-cover transition-opacity duration-200 ${
                  imageStatus === "loaded" ? "opacity-100" : "opacity-0"
                }`}
              />
            </button>
          )}
        </div>
      ) : null}

      {post.video_url && !imageOnly ? (
        <div className="max-w-full overflow-hidden px-4 pb-4">
          {videoStatus === "error" ? (
            <MediaFallback
              label="Video unavailable"
              onRetry={() => {
                setVideoStatus("loading");
                setVideoRetryKey((value) => value + 1);
              }}
            />
          ) : (
            <div className="relative aspect-video overflow-hidden rounded-[20px] bg-slate-950">
              {videoStatus !== "loaded" ? <MediaSkeleton dark /> : null}
              <video
                key={`${post.video_url}-${videoRetryKey}`}
                ref={videoRef}
                controls
                loop
                muted
                onLoadedData={() => setVideoStatus("loaded")}
                onLoadedMetadata={() => setVideoStatus("loaded")}
                onCanPlay={() => setVideoStatus("loaded")}
                onError={() => setVideoStatus("error")}
                onPlay={(event) => pauseOtherExploreMedia(event.currentTarget)}
                playsInline
                preload="metadata"
                src={post.video_url}
                className={`h-full max-h-[520px] w-full max-w-full object-cover transition-opacity duration-200 ${
                  videoStatus === "loaded" ? "opacity-100" : "opacity-0"
                }`}
              />
            </div>
          )}
        </div>
      ) : null}

      {post.audio_url && !imageOnly ? (
        <div className="max-w-full overflow-hidden px-4 pb-4">
          <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-sm font-bold text-slate-900">Voice note</p>
            <audio
              ref={audioRef}
              controls
              preload="metadata"
              src={post.audio_url}
              onPlay={(event) => pauseOtherExploreMedia(event.currentTarget)}
              className="w-full"
            />
            {post.audio_duration_seconds ? (
              <p className="mt-2 text-xs font-semibold text-slate-500">{post.audio_duration_seconds}s</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {imagePreviewOpen && imageStatus === "loaded" && viewerOrigin && viewerTarget
        ? createPortal(
            <div
              ref={viewerGestures.viewportRef}
              className="fixed inset-0 z-[1200] overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Full-screen image viewer"
              style={{ touchAction: "none" }}
              {...viewerGestures.stageHandlers}
            >
              <div
                className="kt-image-viewer-backdrop absolute inset-0 h-full w-full bg-slate-950"
                style={{ opacity: viewerPhase === "open" ? 0.96 : 0 }}
                aria-hidden="true"
              />

              <div
                className="kt-image-viewer-controls pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white"
                style={{ opacity: viewerPhase === "open" ? 1 : 0 }}
              >
                <button
                  type="button"
                  onClick={closeImagePreview}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                  className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/35 text-2xl text-white shadow-xl backdrop-blur-md"
                  aria-label="Back to feed"
                >
                  <HiOutlineArrowLeft />
                </button>
              </div>

              <img
                ref={viewerGestures.imageRef}
                src={post.image_url}
                alt=""
                draggable="false"
                onError={() => {
                  setImageStatus("error");
                  closeImagePreview();
                }}
                className="kt-image-viewer-shared fixed z-10 select-none object-contain shadow-2xl"
                style={{
                  left: `${(viewerPhase === "open" ? viewerTarget : viewerOrigin).left}px`,
                  top: `${(viewerPhase === "open" ? viewerTarget : viewerOrigin).top}px`,
                  width: `${(viewerPhase === "open" ? viewerTarget : viewerOrigin).width}px`,
                  height: `${(viewerPhase === "open" ? viewerTarget : viewerOrigin).height}px`,
                  borderRadius: viewerPhase === "open" ? "0px" : "20px",
                  transform: viewerPhase === "open"
                    ? `translate3d(${viewerGestures.pan.x}px, ${viewerGestures.pan.y}px, 0) scale(${viewerGestures.scale})`
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
        Retry
      </button>
    </div>
  );
}
