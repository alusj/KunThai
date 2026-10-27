import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Mic, Pause, Play } from "lucide-react";

import { useI18n } from "../../../i18n";
import { duckExploreVideos, releaseExploreVideoDuck, voiceCommentAudioHandlers } from "../../Explore/shared/singleMediaPlayback";
import { formatVoiceTime, voiceWaveform } from "./voiceNoteModel";

// One voice note at a time across the app, including notes played through the
// Web Audio fallback (which has no <audio> element for others to pause).
let stopActiveFallback = null;

// Colours live in appearance.css (.kt-voice-*), out of reach of the dark
// theme's overrides of bg-white / bg-slate-*.
const TONES = new Set(["dark", "light", "emerald"]);

function stop(event) {
  event.stopPropagation();
}

/**
 * The voice note bubble content used by every chat: a play button, a waveform
 * that fills as it plays (tap or drag it to seek), and the time. It fixes what
 * the bare <audio> control could not: recordings without a stored duration,
 * taps reaching the message menu, and WebM notes on phones that cannot play
 * them (decoded through Web Audio where possible, otherwise "Open file").
 */
export default function VoiceNotePlayer({ src = "", seed = "", durationHint = 0, tone = "light", loading = false, fluid = false, preload = "metadata", className = "" }) {
  const { t } = useI18n();
  const toneClass = `kt-voice kt-voice-${TONES.has(tone) ? tone : "light"}`;
  const bars = useMemo(() => voiceWaveform(seed || src, 30), [seed, src]);
  const audioRef = useRef(null);
  const fallbackRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(Number(durationHint) || 0);
  const [failed, setFailed] = useState(false);
  const [decoding, setDecoding] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setFailed(false);
    setDuration(Number(durationHint) || 0);
    fallbackRef.current?.stop?.();
    fallbackRef.current = null;
  }, [src, durationHint]);

  useEffect(() => () => fallbackRef.current?.stop?.(), []);

  // MediaRecorder files often carry no duration (Infinity). Seeking far past
  // the end makes the browser work it out; then jump back to the start.
  const handleLoadedMetadata = useCallback((event) => {
    const audio = event.currentTarget;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration);
      return;
    }
    const restore = () => {
      audio.removeEventListener("timeupdate", restore);
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
      audio.currentTime = 0;
    };
    audio.addEventListener("timeupdate", restore);
    try {
      audio.currentTime = 1e7;
    } catch {
      audio.removeEventListener("timeupdate", restore);
    }
  }, []);

  // Web Audio fallback: decode the whole note and play it from memory.
  const playThroughWebAudio = useCallback(async (from = 0) => {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context || !src) throw new Error("no web audio");
    setDecoding(true);
    try {
      let decoded = fallbackRef.current?.buffer;
      const context = fallbackRef.current?.context || new Context();
      if (!decoded) {
        const response = await fetch(src);
        if (!response.ok) throw new Error("fetch failed");
        const bytes = await response.arrayBuffer();
        decoded = await new Promise((resolve, reject) => {
          const result = context.decodeAudioData(bytes, resolve, reject);
          if (result?.then) result.then(resolve, reject);
        });
      }
      if (context.state === "suspended") await context.resume();
      stopActiveFallback?.();
      audioRef.current?.pause();
      const source = context.createBufferSource();
      source.buffer = decoded;
      source.connect(context.destination);
      const startedAt = context.currentTime - from;
      let frame = 0;
      const tick = () => {
        const position = Math.min(decoded.duration, context.currentTime - startedAt);
        setCurrent(position);
        frame = window.requestAnimationFrame(tick);
      };
      const halt = () => {
        window.cancelAnimationFrame(frame);
        try {
          source.onended = null;
          source.stop();
        } catch {
          // Already stopped.
        }
        setPlaying(false);
        releaseExploreVideoDuck(source);
        if (stopActiveFallback === halt) stopActiveFallback = null;
      };
      source.onended = () => {
        halt();
        setCurrent(0);
      };
      // Videos drop to 5% (or pause, on iOS) while the note plays, as with
      // the <audio> element.
      duckExploreVideos(source, "playback");
      source.start(0, from);
      fallbackRef.current = { context, buffer: decoded, stop: halt, startedAt };
      stopActiveFallback = halt;
      setDuration(decoded.duration);
      setPlaying(true);
      frame = window.requestAnimationFrame(tick);
    } finally {
      setDecoding(false);
    }
  }, [src]);

  const togglePlay = useCallback(async (event) => {
    event?.stopPropagation();
    if (!src || failed) return;
    if (playing) {
      if (fallbackRef.current?.stop && stopActiveFallback === fallbackRef.current.stop) fallbackRef.current.stop();
      else audioRef.current?.pause();
      return;
    }
    if (fallbackRef.current?.buffer) {
      playThroughWebAudio(current).catch(() => setFailed(true));
      return;
    }
    const audio = audioRef.current;
    try {
      stopActiveFallback?.();
      await audio.play();
    } catch (error) {
      if (error?.name === "NotAllowedError") return;
      playThroughWebAudio(0).catch(() => setFailed(true));
    }
  }, [current, failed, playThroughWebAudio, playing, src]);

  const seekTo = useCallback((event) => {
    event.stopPropagation();
    if (!duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const target = ratio * duration;
    setCurrent(target);
    if (fallbackRef.current?.buffer) {
      if (playing) playThroughWebAudio(target).catch(() => setFailed(true));
      return;
    }
    if (audioRef.current) audioRef.current.currentTime = target;
  }, [duration, playThroughWebAudio, playing]);

  const progress = duration ? Math.min(1, current / duration) : 0;
  const busy = loading || decoding || (!src && !failed);
  const shownTime = playing || current > 0 ? formatVoiceTime(current) : formatVoiceTime(duration);

  if (failed) {
    return (
      <div className={`${toneClass} flex min-w-[13rem] items-center gap-3 ${className}`} onClick={stop}>
        <span className="kt-voice-button grid h-10 w-10 flex-none place-items-center rounded-full opacity-70">
          <Mic size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="kt-voice-time text-xs font-bold leading-5">{t("voiceNotes.unavailable")}</p>
          {src ? (
            <a href={src} target="_blank" rel="noreferrer" className="text-xs font-black underline underline-offset-2">
              {t("voiceNotes.openFile")}
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${toneClass} flex ${fluid ? "w-full" : "w-[min(16.5rem,62vw)]"} min-w-[12rem] items-center gap-3 ${className}`}
      onClick={stop}
      role="group"
      aria-label={t("voiceNotes.voiceNote")}
    >
      <button
        type="button"
        onClick={togglePlay}
        disabled={busy}
        aria-label={playing ? t("voiceNotes.pause") : t("voiceNotes.play")}
        className="kt-pressable kt-voice-button grid h-10 w-10 flex-none place-items-center rounded-full shadow-sm transition disabled:opacity-60"
      >
        {busy ? (
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        ) : playing ? (
          <Pause size={18} fill="currentColor" aria-hidden="true" />
        ) : (
          <Play size={18} fill="currentColor" className="translate-x-[1px]" aria-hidden="true" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div
          className="flex h-8 cursor-pointer items-center gap-[2px]"
          onClick={seekTo}
          role="slider"
          tabIndex={-1}
          aria-label={t("voiceNotes.voiceNote")}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration) || 0}
          aria-valuenow={Math.round(current)}
        >
          {bars.map((height, index) => (
            <span
              key={index}
              className="kt-voice-bar w-[3px] flex-1 rounded-full transition-colors"
              data-played={(index + 0.5) / bars.length <= progress ? "true" : "false"}
              style={{ height: `${Math.round(height * 100)}%` }}
            />
          ))}
        </div>
        <p className="kt-voice-time mt-0.5 text-[11px] font-bold tabular-nums">{shownTime}</p>
      </div>
      {src ? (
        <audio
          ref={audioRef}
          src={src}
          preload={preload}
          className="hidden"
          onLoadedMetadata={handleLoadedMetadata}
          onDurationChange={(event) => {
            const value = event.currentTarget.duration;
            if (Number.isFinite(value) && value > 0) setDuration(value);
          }}
          onTimeUpdate={(event) => {
            if (playing) setCurrent(event.currentTarget.currentTime);
          }}
          onPlay={(event) => {
            setPlaying(true);
            voiceCommentAudioHandlers.onPlay(event);
          }}
          onPause={(event) => {
            setPlaying(false);
            voiceCommentAudioHandlers.onPause(event);
          }}
          onEnded={(event) => {
            setPlaying(false);
            setCurrent(0);
            voiceCommentAudioHandlers.onEnded(event);
          }}
        />
      ) : null}
    </div>
  );
}

/** The "ready to send" row above a chat composer, with a preview player. */
export function VoiceNoteDraft({ dataUrl, seconds = 0, onRemove, removeLabel, className = "" }) {
  const { t } = useI18n();
  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2 ${className}`}>
      <VoiceNotePlayer src={dataUrl} seed={dataUrl.slice(-64)} durationHint={seconds} tone="light" />
      <p className="sr-only">{t("voiceNotes.ready", { time: formatVoiceTime(seconds) })}</p>
      <button
        type="button"
        onClick={onRemove}
        className="ms-auto grid h-9 w-9 flex-none place-items-center rounded-full bg-white text-slate-500 shadow-sm"
        aria-label={removeLabel || t("voiceNotes.discard")}
      >
        <span aria-hidden="true" className="text-lg leading-none">×</span>
      </button>
    </div>
  );
}
