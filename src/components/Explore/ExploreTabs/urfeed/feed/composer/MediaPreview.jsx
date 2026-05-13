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
  trimError = "",
  onTrimStartChange,
  onTrimPreset,
  onTrimVideo,
  onRetryTrim,
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

      {videoPreview && !pendingVideoUrl ? (
        <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-slate-950">
          <video
            src={videoPreview}
            controls
            onPlay={(event) => pauseOtherExploreMedia(event.currentTarget)}
            onTimeUpdate={(event) => {
              if (event.currentTarget.currentTime >= videoTrimStart + maxVideoSeconds) {
                event.currentTarget.currentTime = videoTrimStart;
                event.currentTarget.play().catch(() => {});
              }
            }}
            className="max-h-[420px] w-full object-contain"
          />
          <RemoveButton onClick={onRemoveVideo} />
          <div className="absolute bottom-3 left-3 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-slate-800">
            Sending to Swip
          </div>
        </div>
      ) : null}

      {pendingVideoUrl ? (
        <div className="relative overflow-hidden rounded-[22px] border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <video
            ref={pendingVideoRef}
            src={pendingVideoUrl}
            controls={false}
            autoPlay
            muted={false}
            playsInline
            loop
            onPlay={(event) => pauseOtherExploreMedia(event.currentTarget)}
            className="max-h-[360px] w-full rounded-[18px] bg-slate-950 object-contain"
          />
          <RemoveButton onClick={onRemoveVideo} />
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-white/85 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-amber-950">Auto 15s Swip clip</p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-amber-800">
                    Your video is {Math.ceil(videoDuration)}s. The first {maxVideoSeconds}s is ready by default; adjust only if you want.
                  </p>
                </div>
                <span className="flex-none rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-900">
                  {Math.round(videoTrimStart)}s-{Math.round(Math.min(videoDuration, videoTrimStart + maxVideoSeconds))}s
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                ["First 15s", 0],
                ["Middle 15s", Math.max(0, (videoDuration - maxVideoSeconds) / 2)],
                ["Last 15s", Math.max(0, videoDuration - maxVideoSeconds)],
              ].map(([label, start]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => onTrimPreset?.(Number(start))}
                  className="h-10 rounded-2xl bg-white px-2 text-xs font-black text-amber-900 shadow-sm ring-1 ring-amber-200 transition active:scale-[0.98]"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="rounded-[22px] border border-amber-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between text-xs font-black uppercase tracking-[0.14em] text-amber-700">
                <span>Clip timeline</span>
                <span>{maxVideoSeconds}s max</span>
              </div>
              <div className="relative h-16 overflow-hidden rounded-2xl bg-slate-950">
                <div className="absolute inset-0 grid grid-cols-[repeat(15,minmax(0,1fr))] gap-px p-1">
                  {Array.from({ length: 15 }).map((_, index) => (
                    <span key={index} className="rounded bg-gradient-to-b from-slate-600 to-slate-800" />
                  ))}
                </div>
                <div
                  className="absolute inset-y-1 rounded-xl border-2 border-white bg-amber-300/20 shadow-[0_0_0_999px_rgba(2,6,23,0.5)] transition-[left] duration-150"
                  style={{
                    left: `${Math.max(0, (videoTrimStart / Math.max(videoDuration, 1)) * 100)}%`,
                    width: `${Math.min(100, (maxVideoSeconds / Math.max(videoDuration, 1)) * 100)}%`,
                  }}
                >
                  <span className="absolute -left-2 top-1/2 h-10 w-4 -translate-y-1/2 rounded-full bg-white shadow" />
                  <span className="absolute -right-2 top-1/2 h-10 w-4 -translate-y-1/2 rounded-full bg-white shadow" />
                </div>
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, Math.floor(videoDuration - maxVideoSeconds))}
                  value={videoTrimStart}
                  onChange={(event) => onTrimStartChange?.(Number(event.target.value))}
                  className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
                  aria-label="Choose Swip clip start"
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs font-black text-slate-500">
                <span>0s</span>
                <span>{Math.ceil(videoDuration)}s</span>
              </div>
            </div>

            {trimError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                {trimError}
              </div>
            ) : null}

            <button
              type="button"
              onClick={trimError ? onRetryTrim : onTrimVideo}
              disabled={trimmingVideo}
              className="h-12 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition active:scale-[0.98] disabled:bg-slate-300"
            >
              {trimmingVideo ? "Preparing clip..." : trimError ? "Retry clip" : videoPreview ? "Clip ready" : `Use this ${maxVideoSeconds}s clip`}
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
