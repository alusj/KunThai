import { HiOutlineXMark } from "react-icons/hi2";
import { useEffect, useRef } from "react";

import { pauseOtherExploreMedia } from "../../../../shared/singleMediaPlayback";

function RemoveButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm"
      aria-label="Remove media"
    >
      <HiOutlineXMark />
    </button>
  );
}

export default function MediaPreview({
  imagePreview,
  videoPreview,
  audioPreview,
  pendingVideoUrl,
  videoDuration = 0,
  videoTrimStart = 0,
  maxVideoSeconds = 15,
  trimmingVideo = false,
  onTrimStartChange,
  onTrimVideo,
  onRemoveImage,
  onRemoveVideo,
  onRemoveAudio,
}) {
  const pendingVideoRef = useRef(null);

  useEffect(() => {
    const video = pendingVideoRef.current;
    if (!video || !pendingVideoUrl) {
      return;
    }

    const nextTime = Math.max(0, Math.min(videoTrimStart, Math.max(0, videoDuration - 0.25)));
    if (Number.isFinite(nextTime) && Math.abs((video.currentTime || 0) - nextTime) > 0.35) {
      video.currentTime = nextTime;
    }
  }, [pendingVideoUrl, videoDuration, videoTrimStart]);

  if (!imagePreview && !videoPreview && !audioPreview && !pendingVideoUrl) {
    return null;
  }

  return (
    <div className="space-y-3">
      {imagePreview ? (
        <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-slate-100">
          <img src={imagePreview} alt="Selected post attachment" className="max-h-[360px] w-full object-cover" />
          <RemoveButton onClick={onRemoveImage} />
        </div>
      ) : null}

      {videoPreview ? (
        <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-slate-950">
          <video
            src={videoPreview}
            controls
            onPlay={(event) => pauseOtherExploreMedia(event.currentTarget)}
            className="max-h-[420px] w-full object-contain"
          />
          <RemoveButton onClick={onRemoveVideo} />
          <div className="absolute bottom-3 left-3 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-slate-800">
            Sending to Swip
          </div>
        </div>
      ) : null}

      {pendingVideoUrl ? (
        <div className="relative overflow-hidden rounded-[22px] border border-amber-200 bg-amber-50 p-4">
          <video
            ref={pendingVideoRef}
            src={pendingVideoUrl}
            controls
            onPlay={(event) => pauseOtherExploreMedia(event.currentTarget)}
            className="max-h-[360px] w-full rounded-[18px] bg-slate-950 object-contain"
          />
          <RemoveButton onClick={onRemoveVideo} />
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-sm font-black text-amber-900">Trim required</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-amber-800">
                This video is {Math.ceil(videoDuration)} seconds. Choose a {maxVideoSeconds}-second section to post.
              </p>
            </div>
            <label className="block text-xs font-black uppercase tracking-[0.16em] text-amber-700">
              Manual trim window
            </label>
            <div className="rounded-2xl border border-amber-200 bg-white/80 p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between text-xs font-black text-amber-900">
                <span>{Math.round(videoTrimStart)}s</span>
                <span>{Math.round(Math.min(videoDuration, videoTrimStart + maxVideoSeconds))}s</span>
              </div>
              <div className="relative h-12 overflow-hidden rounded-xl bg-slate-950/90">
                <div className="absolute inset-y-0 left-0 right-0 grid grid-cols-12 gap-px p-1">
                  {Array.from({ length: 12 }).map((_, index) => (
                    <span key={index} className="rounded-sm bg-white/20" />
                  ))}
                </div>
                <div
                  className="absolute inset-y-1 rounded-lg border-2 border-white bg-amber-400/20 shadow-[0_0_0_999px_rgba(15,23,42,0.42)]"
                  style={{
                    left: `${Math.max(0, (videoTrimStart / Math.max(videoDuration, 1)) * 100)}%`,
                    width: `${Math.min(100, (maxVideoSeconds / Math.max(videoDuration, 1)) * 100)}%`,
                  }}
                >
                  <span className="absolute -left-1 top-1/2 h-8 w-2 -translate-y-1/2 rounded-full bg-white" />
                  <span className="absolute -right-1 top-1/2 h-8 w-2 -translate-y-1/2 rounded-full bg-white" />
                </div>
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, Math.floor(videoDuration - maxVideoSeconds))}
                  value={videoTrimStart}
                  onChange={(event) => onTrimStartChange?.(Number(event.target.value))}
                  className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
                  aria-label="Choose video trim start"
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onTrimStartChange?.(Math.max(0, videoTrimStart - 1))}
                  className="h-9 rounded-xl bg-amber-100 text-xs font-black text-amber-900"
                >
                  -1s
                </button>
                <button
                  type="button"
                  onClick={() => onTrimStartChange?.(Math.min(Math.max(0, videoDuration - maxVideoSeconds), videoTrimStart + 1))}
                  className="h-9 rounded-xl bg-amber-100 text-xs font-black text-amber-900"
                >
                  +1s
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={onTrimVideo}
              disabled={trimmingVideo}
              className="h-11 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white disabled:bg-slate-300"
            >
              {trimmingVideo ? "Trimming..." : `Trim to ${maxVideoSeconds}s`}
            </button>
          </div>
        </div>
      ) : null}

      {audioPreview ? (
        <div className="relative rounded-[22px] border border-slate-200 bg-slate-50 p-4">
          <p className="mb-2 text-sm font-bold text-slate-900">Voice note</p>
          <audio controls src={audioPreview} onPlay={(event) => pauseOtherExploreMedia(event.currentTarget)} className="h-10 w-full" />
          <RemoveButton onClick={onRemoveAudio} />
        </div>
      ) : null}
    </div>
  );
}
