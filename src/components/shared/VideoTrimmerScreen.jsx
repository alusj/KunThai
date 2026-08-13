import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Scissors, X } from "lucide-react";
import { t as i18nText } from "../../i18n/index";

const MIN_CLIP_SECONDS = 1;
// Recording bitrate is capped so a full clip stays below the upload limit
// even before the post-trim size check runs.
const MAX_RECORDING_BITS_PER_SECOND = 8_000_000;

function formatVideoMb(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? String(Math.round(mb)) : mb.toFixed(1);
}

function formatClock(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safe / 60);
  const secs = safe - mins * 60;
  return `${mins}:${secs.toFixed(1).padStart(4, "0")}`;
}

function pickRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function trimmedFileName(originalName, mimeType) {
  const base = String(originalName || "product-video").replace(/\.[^.]+$/, "");
  const extension = mimeType.includes("mp4") ? "mp4" : "webm";
  return `${base}-trimmed.${extension}`;
}

// Full-screen freehand trimmer: drag either handle independently to trim from
// the left or the right, preview the selection, then re-encode the clip so it
// fits the given duration and size limits. Shared by UrMall products and
// Explore posts.
export default function VideoTrimmerScreen({
  file,
  onCancel,
  onComplete,
  maxSeconds = 30,
  maxMb = 50,
  eyebrow = "Trim video",
}) {
  // Aim the recording bitrate a little under the size limit.
  const targetOutputMb = Math.max(1, maxMb - 5);
  const videoRef = useRef(null);
  const railRef = useRef(null);
  const dragRef = useRef(null);
  const trimSessionRef = useRef(null);
  const [duration, setDuration] = useState(0);
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [currentTime, setCurrentTime] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [trimming, setTrimming] = useState(false);
  const [trimProgress, setTrimProgress] = useState(0);
  const [error, setError] = useState("");

  const videoUrl = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => {
    return () => URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  useEffect(() => {
    return () => {
      const session = trimSessionRef.current;
      if (session?.recorder && session.recorder.state !== "inactive") {
        try {
          session.cancelled = true;
          session.recorder.stop();
        } catch {
          // Unmount cleanup only.
        }
      }
    };
  }, []);

  const clipSeconds = Math.max(0, range.end - range.start);
  const clipTooLong = clipSeconds > maxSeconds + 0.05;
  const ready = duration > 0;

  function handleLoadedMetadata(event) {
    const video = event.target;

    function applyDuration(total) {
      setDuration(total);
      setRange({ start: 0, end: Math.min(total, maxSeconds) });
    }

    if (Number.isFinite(video.duration) && video.duration > 0) {
      applyDuration(video.duration);
      return;
    }

    // Recorded videos can report Infinity until the element is seeked far
    // past the end once.
    video.ontimeupdate = () => {
      video.ontimeupdate = null;
      video.currentTime = 0;
      if (Number.isFinite(video.duration) && video.duration > 0) {
        applyDuration(video.duration);
      } else {
        setError(i18nText("ui.literals.k9f2e49a7c376"));
      }
    };
    video.currentTime = Number.MAX_SAFE_INTEGER;
  }

  function timeFromClientX(clientX) {
    const rail = railRef.current;
    if (!rail || !duration) return 0;
    const rect = rail.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    return ratio * duration;
  }

  const stopPreview = useCallback(() => {
    setPreviewing(false);
    videoRef.current?.pause();
  }, []);

  function startHandleDrag(edge, event) {
    if (trimming) return;
    event.preventDefault();
    stopPreview();
    dragRef.current = { edge };
    event.target.setPointerCapture?.(event.pointerId);
  }

  function moveHandleDrag(event) {
    const drag = dragRef.current;
    if (!drag || trimming) return;
    const time = timeFromClientX(event.clientX);

    setRange((current) => {
      // Free-form trimming: each handle moves independently and only stops at
      // the opposite handle (keeping a minimum playable clip) or the media edge.
      if (drag.edge === "start") {
        const start = Math.min(time, current.end - MIN_CLIP_SECONDS);
        return { ...current, start: Math.max(0, start) };
      }
      const end = Math.max(time, current.start + MIN_CLIP_SECONDS);
      return { ...current, end: Math.min(duration, end) };
    });
  }

  function endHandleDrag() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const video = videoRef.current;
    if (video) {
      video.currentTime = drag.edge === "start" ? rangeRefValue().start : rangeRefValue().end;
    }
  }

  // Range is needed synchronously when a drag ends; reading state through a
  // ref-style getter avoids stale-closure seeks.
  const rangeStateRef = useRef(range);
  rangeStateRef.current = range;
  function rangeRefValue() {
    return rangeStateRef.current;
  }

  function togglePreview() {
    const video = videoRef.current;
    if (!video || trimming) return;

    if (previewing) {
      stopPreview();
      return;
    }

    setError("");
    video.muted = false;
    video.currentTime = range.start;
    video
      .play()
      .then(() => setPreviewing(true))
      .catch(() => setError(i18nText("ui.literals.k2a391210ebee")));
  }

  function handleTimeUpdate(event) {
    const time = event.target.currentTime || 0;
    setCurrentTime(time);

    if (previewing && time >= rangeRefValue().end) {
      stopPreview();
    }
  }

  async function trimVideo() {
    const video = videoRef.current;
    if (!video || trimming || !ready) return;

    if (clipTooLong) {
      setError(i18nText("ui.literals.k95b847aafc04", { value0: maxSeconds }));
      return;
    }

    if (typeof video.captureStream !== "function" || typeof MediaRecorder === "undefined") {
      setError(i18nText("ui.literals.k2ce862fd1561"));
      return;
    }

    const mimeType = pickRecorderMimeType();
    setError("");
    setTrimming(true);
    setTrimProgress(0);
    stopPreview();

    try {
      const { start, end } = rangeRefValue();
      const selectionSeconds = Math.max(end - start, MIN_CLIP_SECONDS);
      video.muted = true;
      video.currentTime = start;
      await new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("Video seek timed out.")), 8000);
        video.onseeked = () => {
          window.clearTimeout(timer);
          video.onseeked = null;
          resolve();
        };
      });

      const stream = video.captureStream();
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: Math.min(
          MAX_RECORDING_BITS_PER_SECOND,
          Math.floor((targetOutputMb * 1024 * 1024 * 8) / selectionSeconds),
        ),
      });
      const chunks = [];
      const session = { recorder, cancelled: false };
      trimSessionRef.current = session;

      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };

      const finished = new Promise((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = () => reject(new Error("Trimming failed while recording the clip."));
      });

      recorder.start(250);
      await video.play();

      // Event listeners plus an interval keep the watcher running even when
      // the tab is hidden (requestAnimationFrame freezes there and would let
      // the recording run past the selection). A stall watchdog aborts if the
      // browser refuses to advance playback, e.g. a backgrounded tab.
      const stalled = await new Promise((resolve) => {
        let intervalId = 0;
        let lastTime = video.currentTime;
        let stalledChecks = 0;

        function finishWatch(didStall) {
          window.clearInterval(intervalId);
          video.removeEventListener("timeupdate", checkProgress);
          video.removeEventListener("ended", checkProgress);
          resolve(didStall);
        }

        function checkProgress() {
          if (session.cancelled || recorder.state === "inactive") {
            finishWatch(false);
            return;
          }
          const played = Math.min(Math.max(video.currentTime - start, 0), selectionSeconds);
          setTrimProgress(played / selectionSeconds);
          if (video.currentTime >= end || video.ended) {
            finishWatch(false);
            return;
          }
          if (video.currentTime === lastTime) {
            stalledChecks += 1;
            // ~12 seconds without playback progress means recording cannot finish.
            if (stalledChecks >= 40) finishWatch(true);
          } else {
            stalledChecks = 0;
            lastTime = video.currentTime;
          }
        }

        video.addEventListener("timeupdate", checkProgress);
        video.addEventListener("ended", checkProgress);
        intervalId = window.setInterval(checkProgress, 300);
        checkProgress();
      });

      if (stalled) {
        throw new Error("Trimming paused because the video could not play. Keep this screen visible and try again.");
      }

      video.pause();
      if (recorder.state !== "inactive") recorder.stop();
      await finished;
      trimSessionRef.current = null;

      if (session.cancelled) return;

      const outputType = mimeType || chunks[0]?.type || "video/webm";
      const blob = new Blob(chunks, { type: outputType });
      if (!blob.size) throw new Error("Trimming produced an empty clip. Please try again.");
      if (blob.size > maxMb * 1024 * 1024) {
        throw new Error(
          `The trimmed clip is still ${formatVideoMb(blob.size)} MB. Trim a shorter part so it stays under ${maxMb} MB.`,
        );
      }

      const trimmedFile = new File([blob], trimmedFileName(file.name, outputType), { type: outputType });
      onComplete?.(trimmedFile, { durationSeconds: selectionSeconds });
    } catch (trimError) {
      setError(trimError.message || i18nText("ui.literals.k4588413b0525"));
    } finally {
      videoRef.current?.pause();
      setTrimming(false);
      setTrimProgress(0);
    }
  }

  const startPercent = duration ? (range.start / duration) * 100 : 0;
  const endPercent = duration ? (range.end / duration) * 100 : 100;
  const playheadPercent = duration ? Math.min((currentTime / duration) * 100, 100) : 0;

  return (
    <div className="fixed inset-0 z-[1300] flex flex-col bg-gray-950">
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 px-4">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-400">{eyebrow}</p>
          <p className="truncate text-sm font-black text-white">{file.name}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (trimming) return;
            stopPreview();
            onCancel?.();
          }}
          disabled={trimming}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-40"
          aria-label={i18nText("ui.literals.kf915a9fd71bc")}
        >
          <X size={20} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center px-4">
        <video
          ref={videoRef}
          src={videoUrl}
          playsInline
          preload="auto"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPause={() => setPreviewing(false)}
          className="max-h-full w-full max-w-3xl rounded-xl bg-black object-contain"
        />
      </div>

      <div className="shrink-0 space-y-4 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        <div className="mx-auto w-full max-w-3xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-black text-white/80">
            <span>
              {i18nText("ui.literals.k2e0844789cb4")} <span className={clipTooLong ? "text-red-400" : "text-emerald-400"}>{formatClock(clipSeconds)}</span>
              {" "}{i18nText("ui.literals.kde04fa0e29f9")} {formatClock(duration)}
            </span>
            <span>
              {formatClock(range.start)} → {formatClock(range.end)}
            </span>
          </div>

          <div
            ref={railRef}
            className="relative h-14 touch-none select-none rounded-xl bg-white/10"
            onPointerMove={moveHandleDrag}
            onPointerUp={endHandleDrag}
            onPointerCancel={endHandleDrag}
          >
            <div
              className={`absolute inset-y-0 rounded-lg border-2 ${clipTooLong ? "border-red-400 bg-red-400/20" : "border-emerald-400 bg-emerald-400/20"}`}
              style={{ left: `${startPercent}%`, right: `${100 - endPercent}%` }}
            />
            <div
              className="pointer-events-none absolute inset-y-1 w-0.5 rounded-full bg-white/70"
              style={{ left: `${playheadPercent}%` }}
            />
            <button
              type="button"
              aria-label={i18nText("ui.literals.keb724bcc15e9")}
              onPointerDown={(event) => startHandleDrag("start", event)}
              className="absolute inset-y-0 z-10 -ml-3.5 flex w-7 cursor-ew-resize items-center justify-center"
              style={{ left: `${startPercent}%` }}
            >
              <span className={`h-12 w-3 rounded-full border border-white/40 ${clipTooLong ? "bg-red-400" : "bg-emerald-400"}`} />
            </button>
            <button
              type="button"
              aria-label={i18nText("ui.literals.k82dbc194d356")}
              onPointerDown={(event) => startHandleDrag("end", event)}
              className="absolute inset-y-0 z-10 -ml-3.5 flex w-7 cursor-ew-resize items-center justify-center"
              style={{ left: `${endPercent}%` }}
            >
              <span className={`h-12 w-3 rounded-full border border-white/40 ${clipTooLong ? "bg-red-400" : "bg-emerald-400"}`} />
            </button>
          </div>

          <p className="text-xs font-bold text-white/60">
            {i18nText("ui.literals.kf3da77566424")} {maxSeconds} {i18nText("ui.literals.k4f608aaaa98c")} {maxMb} {i18nText("ui.literals.kc8f32141664d")}
          </p>

          {clipTooLong ? (
            <p className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-xs font-black text-red-300">
              {i18nText("ui.literals.kba6173068e57")} {formatClock(clipSeconds)} {i18nText("ui.literals.ka464e664ba7c")} {maxSeconds} {i18nText("ui.literals.k323803b870cd")}
            </p>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-xs font-black text-red-300">{error}</p>
          ) : null}

          {trimming ? (
            <div className="space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${Math.round(trimProgress * 100)}%` }} />
              </div>
              <p className="text-xs font-black text-emerald-300">
                {i18nText("ui.literals.kd62acee1d690")} {Math.round(trimProgress * 100)}{i18nText("ui.literals.k8fa0da413cce")}
              </p>
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={togglePreview}
              disabled={!ready || trimming}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-black text-white transition hover:bg-white/20 disabled:opacity-40"
            >
              {previewing ? <Pause size={17} /> : <Play size={17} />}
              {previewing ? i18nText("ui.literals.k805180fb9380") : i18nText("ui.literals.k562661b11701")}
            </button>
            <button
              type="button"
              onClick={trimVideo}
              disabled={!ready || trimming || clipTooLong}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-black text-gray-950 transition hover:bg-emerald-400 disabled:opacity-40"
            >
              <Scissors size={17} />
              {trimming ? i18nText("ui.literals.k910f870e3c2b") : i18nText("ui.literals.kd3faed5cd101")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
