import {
  HiOutlineCheck,
  HiOutlinePause,
  HiOutlinePlay,
  HiOutlineSpeakerWave,
  HiOutlineSpeakerXMark,
  HiOutlineXMark,
} from "react-icons/hi2";
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

function waitForVideoEvent(video, eventName, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Video preview timed out."));
    }, timeoutMs);

    function cleanup() {
      window.clearTimeout(timer);
      video.removeEventListener(eventName, handleSuccess);
      video.removeEventListener("error", handleError);
    }

    function handleSuccess() {
      cleanup();
      resolve();
    }

    function handleError() {
      cleanup();
      reject(new Error("Unable to preview video."));
    }

    video.addEventListener(eventName, handleSuccess, { once: true });
    video.addEventListener("error", handleError, { once: true });
  });
}

async function captureVideoThumbnails(videoUrl, count = 12) {
  if (!videoUrl) return [];

  const video = document.createElement("video");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const thumbnails = [];

  if (!ctx) return thumbnails;

  video.src = videoUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";

  await waitForVideoEvent(video, "loadedmetadata", 7000);

  const duration = Math.max(0.1, video.duration || 0.1);
  const ratio = (video.videoHeight || 16) / Math.max(1, video.videoWidth || 9);
  canvas.width = 96;
  canvas.height = Math.max(54, Math.round(canvas.width * ratio));

  for (let index = 0; index < count; index += 1) {
    const targetTime = Math.min(Math.max(0.05, duration - 0.12), (duration * (index + 0.5)) / count);
    video.currentTime = targetTime;
    await waitForVideoEvent(video, "seeked", 2500).catch(() => {});

    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      thumbnails.push(canvas.toDataURL("image/jpeg", 0.58));
    } catch {
      // Skip frames the browser cannot decode quickly.
    }
  }

  video.removeAttribute("src");
  video.load();
  return thumbnails;
}

export default function MediaPreview({
  imagePreview,
  videoPreview,
  audioPreview,
  pendingVideoUrl,
  videoDuration = 0,
  videoTrimStart = 0,
  videoTrimEnd = 15,
  maxVideoSeconds = 15,
  trimmingVideo = false,
  trimError = "",
  onTrimStartChange,
  onTrimEndChange,
  onTrimPreset,
  onTrimVideo,
  onRetryTrim,
  onRemoveImage,
  onRemoveVideo,
  onRemoveAudio,
}) {
  const pendingVideoRef = useRef(null);
  const [playing, setPlaying] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [thumbnails, setThumbnails] = useState([]);

  const safeDuration = Math.max(1, videoDuration || 1);
  const safeTrimStart = Math.max(0, Math.min(videoTrimStart, Math.max(0, safeDuration - 0.5)));
  const safeTrimEnd = Math.min(safeDuration, Math.max(safeTrimStart + 0.5, Math.min(videoTrimEnd, safeTrimStart + maxVideoSeconds)));
  const clipSeconds = Math.max(0.5, Math.min(maxVideoSeconds, safeTrimEnd - safeTrimStart));
  const clipEnd = safeTrimStart + clipSeconds;
  const selectedLeft = Math.max(0, (safeTrimStart / safeDuration) * 100);
  const selectedWidth = Math.max(4, (clipSeconds / safeDuration) * 100);

  useEffect(() => {
    const video = pendingVideoRef.current;
    if (!video || !pendingVideoUrl) return;

    const nextTime = Math.max(0, Math.min(safeTrimStart, Math.max(0, safeDuration - 0.25)));

    if (Number.isFinite(nextTime)) {
      video.currentTime = nextTime;
    }
  }, [pendingVideoUrl, safeDuration, safeTrimStart]);

  useEffect(() => {
    const video = pendingVideoRef.current;
    if (!video || !pendingVideoUrl) return;

    video.muted = !soundOn;
    video.volume = soundOn ? 1 : 0;

    if (playing) {
      video.play().catch(() => {});
    }
  }, [pendingVideoUrl, playing, soundOn]);

  useEffect(() => {
    if (!pendingVideoUrl) {
      setThumbnails([]);
      return undefined;
    }

    let alive = true;
    setThumbnails([]);

    captureVideoThumbnails(pendingVideoUrl)
      .then((nextThumbnails) => {
        if (alive) setThumbnails(nextThumbnails);
      })
      .catch(() => {
        if (alive) setThumbnails([]);
      });

    return () => {
      alive = false;
    };
  }, [pendingVideoUrl]);

  function handlePreviewTime(event) {
    const video = event.currentTarget;

    if (video.currentTime >= clipEnd) {
      video.currentTime = safeTrimStart;
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

  function toggleSound() {
    const nextSound = !soundOn;
    setSoundOn(nextSound);

    const video = pendingVideoRef.current;
    if (video) {
      video.muted = !nextSound;
      video.volume = nextSound ? 1 : 0;
      video.play().catch(() => {});
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
        <div className="fixed inset-0 z-[95] flex flex-col overflow-hidden bg-black text-white">
          <div className="flex h-[calc(env(safe-area-inset-top)+76px)] flex-none items-end justify-between px-5 pb-3 pt-[env(safe-area-inset-top)]">
            <button
              type="button"
              onClick={onRemoveVideo}
              disabled={trimmingVideo}
              className="kt-pressable h-11 rounded-full border border-white/30 bg-white/10 px-4 text-base font-black text-white shadow-lg shadow-black/30 backdrop-blur disabled:opacity-50"
            >
              Cancel
            </button>

            <div className="pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top)+42px)] -translate-x-1/2 text-center">
              <p className="text-sm font-black uppercase tracking-[0.22em] text-white/55">Video</p>
            </div>

            <button
              type="button"
              onClick={() => (trimError ? onRetryTrim?.() : onTrimVideo?.())}
              disabled={trimmingVideo}
              className="kt-pressable inline-flex h-11 items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 text-base font-black text-white shadow-lg shadow-black/30 backdrop-blur disabled:text-white/45"
            >
              {trimmingVideo ? "Preparing" : "Done"}
              {!trimmingVideo ? <HiOutlineCheck className="text-lg" /> : null}
            </button>
          </div>

          <div className="relative min-h-0 flex-1">
            <video
              ref={pendingVideoRef}
              src={pendingVideoUrl}
              autoPlay
              muted={!soundOn}
              playsInline
              loop={false}
              onClick={togglePendingPreview}
              onPause={() => setPlaying(false)}
              onPlay={(event) => {
                setPlaying(true);
                pauseOtherExploreMedia(event.currentTarget);
              }}
              onTimeUpdate={handlePreviewTime}
              className="h-full w-full object-contain"
            />

            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent" />

            <div className="absolute left-5 top-3 flex flex-col gap-3">
              <button
                type="button"
                onClick={toggleSound}
                className="kt-pressable grid h-14 w-14 place-items-center rounded-full border border-white/25 bg-black/35 text-3xl shadow-xl backdrop-blur"
                aria-label={soundOn ? "Mute preview" : "Unmute preview"}
              >
                {soundOn ? <HiOutlineSpeakerWave /> : <HiOutlineSpeakerXMark />}
              </button>
            </div>

            <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+112px)] left-5 rounded-full bg-white/12 px-3 py-1 text-xs font-black text-white/85 backdrop-blur">
              {formatTime(safeTrimStart)} to {formatTime(clipEnd)} • {formatTime(clipSeconds)} / max {formatTime(maxVideoSeconds)}
            </div>
          </div>

          <div className="flex flex-none flex-col gap-4 px-4 pb-[calc(env(safe-area-inset-bottom)+20px)]">
            {trimError ? (
              <div className="rounded-2xl border border-rose-400/40 bg-rose-500/15 px-4 py-3 text-sm font-bold text-rose-100">
                {trimError}
              </div>
            ) : null}

            <div className="flex items-center gap-2 rounded-xl bg-white/45 p-1.5 shadow-2xl shadow-black/50 backdrop-blur">
              <button
                type="button"
                onClick={togglePendingPreview}
                className="kt-pressable grid h-14 w-14 flex-none place-items-center rounded-lg bg-white/20 text-3xl text-white"
                aria-label={playing ? "Pause preview" : "Play preview"}
              >
                {playing ? <HiOutlinePause /> : <HiOutlinePlay />}
              </button>

              <div className="relative h-14 min-w-0 flex-1 overflow-hidden rounded-lg bg-slate-800">
                <div className="absolute inset-0 flex">
                  {thumbnails.length
                    ? thumbnails.map((thumbnail, index) => (
                        <img
                          key={index}
                          src={thumbnail}
                          alt=""
                          className="h-full min-w-0 flex-1 object-cover"
                          draggable={false}
                        />
                      ))
                    : Array.from({ length: 12 }).map((_, index) => (
                        <span
                          key={index}
                          className="h-full flex-1 animate-pulse border-r border-white/10 bg-gradient-to-br from-slate-500 to-slate-900"
                        />
                      ))}
                </div>

                <div
                  className="absolute inset-y-0 rounded-md border-[3px] border-white bg-white/10 shadow-[0_0_0_999px_rgba(0,0,0,0.48)]"
                  style={{
                    left: `${selectedLeft}%`,
                    width: `${selectedWidth}%`,
                  }}
                >
                  <span className="absolute -left-1.5 top-0 h-full w-2 rounded-full bg-white shadow-lg" />
                  <span className="absolute -right-1.5 top-0 h-full w-2 rounded-full bg-white shadow-lg" />
                </div>

                <input
                  type="range"
                  min="0"
                  max={Math.max(0, safeTrimEnd - 0.5)}
                  step="0.1"
                  value={safeTrimStart}
                  onChange={(event) => onTrimStartChange?.(Number(event.target.value))}
                  className="absolute left-0 top-0 h-1/2 w-full cursor-ew-resize opacity-0"
                  aria-label="Choose clip start"
                />
                <input
                  type="range"
                  min={Math.min(safeDuration, safeTrimStart + 0.5)}
                  max={Math.min(safeDuration, safeTrimStart + maxVideoSeconds)}
                  step="0.1"
                  value={safeTrimEnd}
                  onChange={(event) => onTrimEndChange?.(Number(event.target.value))}
                  className="absolute bottom-0 left-0 h-1/2 w-full cursor-ew-resize opacity-0"
                  aria-label="Choose clip end"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-white/60">
              <div className="rounded-full border border-white/15 bg-white/10 px-3 py-2">
                Start {formatTime(safeTrimStart)}
              </div>
              <div className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-right">
                End {formatTime(clipEnd)}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                ["Start", 0],
                ["Middle", Math.max(0, (videoDuration - maxVideoSeconds) / 2)],
                ["End", Math.max(0, videoDuration - maxVideoSeconds)],
              ].map(([label, start]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => onTrimPreset?.(Number(start))}
                  disabled={trimmingVideo}
                  className="kt-pressable h-10 rounded-full border border-white/18 bg-white/10 text-xs font-black text-white/85 backdrop-blur disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
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
