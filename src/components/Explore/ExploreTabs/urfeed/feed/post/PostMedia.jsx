import { useEffect, useRef, useState } from "react";
import { HiOutlineArrowLeft, HiOutlineArrowPath, HiOutlinePhoto, HiOutlineXMark } from "react-icons/hi2";

import { useBrowserBack } from "../../../../../../Backend/hooks/useBrowserBack";
import { pauseOtherExploreMedia, stopAllExploreMedia } from "../../../../shared/singleMediaPlayback";
import { isAdvertPost } from "../../../../shared/advertUtils";

export default function PostMedia({ post, imageOnly = false }) {
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [imageStatus, setImageStatus] = useState(post.image_url ? "loading" : "idle");
  const [videoStatus, setVideoStatus] = useState(post.video_url ? "loading" : "idle");
  const [imageRetryKey, setImageRetryKey] = useState(0);
  const [videoRetryKey, setVideoRetryKey] = useState(0);
  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const advertPost = isAdvertPost(post);

  useBrowserBack(imagePreviewOpen, () => setImagePreviewOpen(false), `image-preview-${post.id}`);

  useEffect(() => () => stopAllExploreMedia(), []);

  useEffect(() => {
    setImageStatus(post.image_url ? "loading" : "idle");
    setImageRetryKey(0);
    setImagePreviewOpen(false);
  }, [post.image_url]);

  useEffect(() => {
    setVideoStatus(post.video_url ? "loading" : "idle");
    setVideoRetryKey(0);
  }, [post.video_url]);

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
              type="button"
              onClick={() => imageStatus === "loaded" && setImagePreviewOpen(true)}
              className="kt-pressable relative block aspect-[4/3] w-full overflow-hidden rounded-[20px] bg-slate-100 text-left"
              aria-label="Preview image"
            >
              {imageStatus !== "loaded" ? <MediaSkeleton /> : null}
              <img
                key={`${post.image_url}-${imageRetryKey}`}
                loading={advertPost ? "eager" : "lazy"}
                fetchPriority={advertPost ? "high" : "auto"}
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

      {imagePreviewOpen && imageStatus === "loaded" ? (
        <div className="fixed inset-0 z-[90] flex flex-col bg-slate-950">
          <div className="flex h-16 flex-none items-center justify-between px-3 text-white">
            <button
              type="button"
              onClick={() => setImagePreviewOpen(false)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl backdrop-blur"
              aria-label="Back to feed"
            >
              <HiOutlineArrowLeft />
            </button>
            <p className="truncate px-3 text-sm font-black">Image preview</p>
            <button
              type="button"
              onClick={() => setImagePreviewOpen(false)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl backdrop-blur"
              aria-label="Close image preview"
            >
              <HiOutlineXMark />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setImagePreviewOpen(false)}
            className="flex min-h-0 flex-1 items-center justify-center px-2 pb-4"
            aria-label="Close image preview and return to feed"
          >
            <img
  loading="lazy"
  src={post.image_url}
              alt=""
              onError={() => {
                setImageStatus("error");
                setImagePreviewOpen(false);
              }}
              className="max-h-full max-w-full object-contain"
            />
          </button>
        </div>
      ) : null}
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
