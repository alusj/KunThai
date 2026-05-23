import { HiOutlinePlay, HiOutlineXMark } from "react-icons/hi2";
import { useEffect, useRef, useState } from "react";

import { pauseOtherExploreMedia } from "../../../../shared/singleMediaPlayback";

function RemoveButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm"
      aria-label="Remove media"
    >
      <HiOutlineXMark />
    </button>
  );
}

function formatTime(seconds = 0) {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
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
  const [playing, setPlaying] = useState(true);

  const clipEnd = Math.min(videoDuration, videoTrimStart + maxVideoSeconds);
  const maxStart = Math.max(0, Math.floor(videoDuration - maxVideoSeconds));

  useEffect(() => {
    const video = pendingVideoRef.current;
    if (!video || !pendingVideoUrl) return;

    const nextTime = Math.max(0, Math.min(videoTrimStart, Math.max(0, videoDuration - 0.25)));

    if (Number.isFinite(nextTime)) {
      video.currentTime = nextTime;
    }
  }, [pendingVideoUrl, videoDuration, videoTrimStart]);

  function handlePreviewTime(event) {
    const video = event.currentTarget;

    if (video.currentTime >= clipEnd) {
      video.currentTime = videoTrimStart;
      video.play().catch(() => {});
    }
  }

  function togglePendingPreview() {
    const video = pendingVideoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(() => {});
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  }

  if (!imagePreview && !videoPreview && !audioPreview && !pendingVideoUrl) {
    return null;
  }

  return (
    <div className="space-y-4">
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
            playsInline
            onPlay={(event) => pauseOtherExploreMedia(event.currentTarget)}
            className="max-h-[420px] w-full object-contain"
          />
          <RemoveButton onClick={onRemoveVideo} />
          <div className="absolute bottom-3 left-3 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-slate-800">
            Swip clip ready
          </div>
        </div>
      ) : null}

      {pendingVideoUrl ? (
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="relative bg-slate-950">
            <video
              ref={pendingVideoRef}
              src={pendingVideoUrl}
              autoPlay
              muted
              playsInline
              loop
              onPlay={(event) => pauseOtherExploreMedia(event.currentTarget)}
              onTimeUpdate={handlePreviewTime}
              className="max-h-[420px] w-full object-contain"
            />

            <RemoveButton onClick={onRemoveVideo} />

            <button
              type="button"
              onClick={togglePendingPreview}
              className="absolute left-4 top-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-xl text-slate-950 shadow"
            >
              <HiOutlinePlay />
            </button>

            <div className="absolute bottom-4 left-4 rounded-full bg-white/95 px-3 py-1 text-xs font-black text-slate-900">
              Previewing {formatTime(videoTrimStart)}–{formatTime(clipEnd)}
            </div>
          </div>

          <div className="space-y-4 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-slate-950">KunThai Smart Clip</p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  Drag the yellow clip window. We’ll publish only {maxVideoSeconds}s to Swip.
                </p>
              </div>

              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-900">
                {formatTime(videoTrimStart)}–{formatTime(clipEnd)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                ["Start", 0],
                ["Middle", Math.max(0, (videoDuration - maxVideoSeconds) / 2)],
                ["Ending", Math.max(0, videoDuration - maxVideoSeconds)],
              ].map(([label, start]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => onTrimPreset?.(Number(start))}
                  className="h-10 rounded-2xl border border-slate-200 bg-slate-50 text-xs font-black text-slate-700 active:scale-[0.98]"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-3">
              <div className="relative h-16 overflow-hidden rounded-2xl bg-slate-300">
                <div className="absolute inset-0 flex">
                  {Array.from({ length: 12 }).map((_, index) => (
                    <span
                      key={index}
                      className="h-full flex-1 border-r border-white/30 bg-gradient-to-br from-slate-500 to-slate-800"
                    />
                  ))}
                </div>

                <div
                  className="absolute inset-y-0 rounded-xl border-4 border-amber-400 bg-amber-300/35 shadow-[0_0_0_999px_rgba(15,23,42,0.42)]"
                  style={{
                    left: `${Math.max(0, (videoTrimStart / Math.max(videoDuration, 1)) * 100)}%`,
                    width: `${Math.min(100, (maxVideoSeconds / Math.max(videoDuration, 1)) * 100)}%`,
                  }}
                >
                  <span className="absolute -left-3 top-1/2 h-12 w-5 -translate-y-1/2 rounded-full bg-amber-400 shadow" />
                  <span className="absolute -right-3 top-1/2 h-12 w-5 -translate-y-1/2 rounded-full bg-amber-400 shadow" />
                </div>

                <input
                  type="range"
                  min="0"
                  max={maxStart}
                  value={videoTrimStart}
                  onChange={(event) => onTrimStartChange?.(Number(event.target.value))}
                  className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
                  aria-label="Choose clip start"
                />
              </div>

              <div className="mt-2 flex items-center justify-between text-xs font-black text-slate-500">
                <span>0:00</span>
                <span>{formatTime(videoDuration)}</span>
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
              className="h-12 w-full rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition active:scale-[0.98] disabled:bg-slate-300"
            >
              {trimmingVideo ? "Preparing synced clip..." : trimError ? "Try again" : "Done — Use this clip"}
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