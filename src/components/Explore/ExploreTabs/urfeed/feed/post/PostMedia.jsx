import { useEffect, useRef, useState } from "react";
import { HiOutlineArrowPath, HiOutlinePhoto } from "react-icons/hi2";

import { useI18n } from "../../../../../../i18n";
import { pauseOtherExploreMedia, stopAllExploreMedia } from "../../../../shared/singleMediaPlayback";
import { isAdvertPost } from "../../../../shared/advertUtils";
import ZoomableImage from "../../../../shared/ZoomableImage";
import { clipWindowHandlers, postClipRange } from "../../../../shared/clipWindow";
import { t as i18nText } from "../../../../../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../../../i18n/index.js";
import { useExploreSettingsSnapshot } from "../../../../../../Backend/hooks/useExplorePreferences";

export default function PostMedia({ post, imageOnly = false }) {
  const { t } = useI18n();
  const [videoStatus, setVideoStatus] = useState(post.video_url ? "loading" : "idle");
  const [videoRetryKey, setVideoRetryKey] = useState(0);
  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const advertPost = isAdvertPost(post);
  const clipRange = postClipRange(post);
  // Settings > Video: autoplay, default sound and data saver.
  const { video: videoSettings } = useExploreSettingsSnapshot();
  const reduceData = Boolean(videoSettings.reduceData);
  const autoplay = Boolean(videoSettings.autoplay) && !reduceData;
  const startMuted = videoSettings.defaultMuted !== false;

  useEffect(() => () => {
    stopAllExploreMedia();
  }, []);

  // Autoplay while at least 60% of the video is on screen; pause when it leaves.
  useEffect(() => {
    const element = videoRef.current;
    if (!autoplay || !element || imageOnly || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && entry.intersectionRatio >= 0.6) {
        element.play().catch(() => {
          // Browsers refuse autoplay with sound; retry muted.
          element.muted = true;
          element.play().catch(() => {});
        });
      } else if (!element.paused) {
        element.pause();
      }
    }, { threshold: [0, 0.6] });
    observer.observe(element);
    return () => observer.disconnect();
  }, [autoplay, imageOnly, post.video_url, videoRetryKey]);

  useEffect(() => {
    setVideoStatus(post.video_url ? "loading" : "idle");
    setVideoRetryKey(0);
  }, [post.video_url]);

  return (
    <>
      {post.image_url ? (
        <ZoomableImage src={post.image_url} eager={advertPost} idKey={post.id} />
      ) : null}

      {post.video_url && !imageOnly ? (
        <div className="max-w-full overflow-hidden px-4 pb-4">
          {videoStatus === "error" ? (
            <MediaFallback
              label={t("explore.videoUnavailable")}
              onRetry={() => {
                setVideoStatus("loading");
                setVideoRetryKey((value) => value + 1);
              }}
            />
          ) : (
            <div className="relative aspect-video overflow-hidden rounded-[20px] bg-slate-950">
              {videoStatus !== "loaded" && !reduceData ? <MediaSkeleton dark /> : null}
              <video
                key={`${post.video_url}-${videoRetryKey}`}
                ref={videoRef}
                controls
                loop
                muted={startMuted}
                onLoadedData={() => setVideoStatus("loaded")}
                onLoadedMetadata={(event) => {
                  setVideoStatus("loaded");
                  clipWindowHandlers(clipRange.start, clipRange.end).onLoadedMetadata(event);
                }}
                onCanPlay={() => setVideoStatus("loaded")}
                onError={() => setVideoStatus("error")}
                onPlay={(event) => pauseOtherExploreMedia(event.currentTarget)}
                playsInline
                preload={reduceData ? "none" : "metadata"}
                src={post.video_url}
                // Only the trimmed part of the video is the post.
                onTimeUpdate={clipWindowHandlers(clipRange.start, clipRange.end).onTimeUpdate}
                className={`h-full max-h-[520px] w-full max-w-full object-cover transition-opacity duration-200 ${
                  videoStatus === "loaded" || reduceData ? "opacity-100" : "opacity-0"
                }`}
              />
            </div>
          )}
        </div>
      ) : null}

      {post.audio_url && !imageOnly ? (
        <div className="max-w-full overflow-hidden px-4 pb-4">
          <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-sm font-bold text-slate-900">{t("post.voiceNote")}</p>
            <audio
              ref={audioRef}
              controls
              preload={reduceData ? "none" : "metadata"}
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
    </>
  );
}

function MediaSkeleton({ dark = false }) {
  useUiLocale();
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
  useUiLocale();
  return (
    <div className="flex aspect-[4/3] w-full flex-col items-center justify-center rounded-[20px] border border-slate-200 bg-slate-50 px-4 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm">
        <HiOutlinePhoto className="text-2xl" />
      </span>
      <p className="mt-3 text-sm font-black text-slate-900">{translateUi(label)}</p>
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
