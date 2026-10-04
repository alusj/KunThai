import { useEffect, useRef, useState } from "react";
import { HiOutlineTrash } from "react-icons/hi2";

import "./liveRecording.css";

const SAMPLE_INTERVAL_MS = 60;
const MIN_LEVEL = 0.1;

function formatRecordingClock(seconds = 0) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

// Live, voice-reactive bars fed by the microphone stream. Newest level enters
// on the right and scrolls left. Heights are written straight to the DOM so
// the 60 fps loop never re-renders React. Without a stream (or Web Audio) the
// bars fall back to a CSS travelling wave.
export function LiveWaveform({ stream, bars = 28, paused = false, tone = "rose", className = "" }) {
  const barRefs = useRef([]);
  const pausedRef = useRef(paused);
  const [synthetic, setSynthetic] = useState(!stream);

  pausedRef.current = paused;

  useEffect(() => {
    if (!stream) {
      setSynthetic(true);
      return undefined;
    }

    const AudioCtor = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
    if (!AudioCtor) {
      setSynthetic(true);
      return undefined;
    }

    let context;
    let source;
    let frame = 0;
    let lastSample = 0;
    let smoothed = MIN_LEVEL;
    const levels = new Array(bars).fill(MIN_LEVEL);

    try {
      context = new AudioCtor();
      context.resume?.().catch(() => {});
      source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      setSynthetic(false);

      const tick = (now) => {
        frame = window.requestAnimationFrame(tick);
        if (pausedRef.current || now - lastSample < SAMPLE_INTERVAL_MS) return;
        lastSample = now;

        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i += 1) {
          const value = (samples[i] - 128) / 128;
          sum += value * value;
        }
        const rms = Math.sqrt(sum / samples.length);
        // Speech RMS sits around 0.02–0.25; lift it into a lively 0–1 range.
        const target = Math.min(1, Math.max(MIN_LEVEL, Math.pow(rms * 5, 0.75)));
        smoothed += (target - smoothed) * 0.55;

        levels.shift();
        levels.push(smoothed);
        for (let i = 0; i < bars; i += 1) {
          const node = barRefs.current[i];
          if (node) node.style.transform = `scaleY(${levels[i].toFixed(3)})`;
        }
      };
      frame = window.requestAnimationFrame(tick);
    } catch {
      setSynthetic(true);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      try {
        source?.disconnect();
      } catch {
        // Already disconnected.
      }
      context?.close?.().catch(() => {});
    };
  }, [bars, stream]);

  return (
    <div
      className={`kt-rec-wave ${className}`}
      data-synthetic={synthetic ? "true" : "false"}
      data-paused={paused ? "true" : "false"}
      data-tone={tone}
      aria-hidden="true"
    >
      {Array.from({ length: bars }, (_, index) => (
        <span
          key={index}
          ref={(node) => {
            barRefs.current[index] = node;
          }}
          className="kt-rec-bar"
          style={synthetic ? { animationDelay: `${(index % 9) * 90}ms` } : undefined}
        />
      ))}
    </div>
  );
}

// Compact live-recording pill that replaces a composer's text input while the
// mic is open: pulsing red dot, running clock, live waveform, discard.
export function LiveRecordingStrip({ stream, seconds = 0, paused = false, label, onCancel, cancelLabel, className = "" }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      data-paused={paused ? "true" : "false"}
      className={`kt-rec-strip flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-2xl pl-3.5 pr-1.5 text-white ${className}`}
    >
      <span className="kt-rec-dot" />
      <span className="kt-rec-time flex-none text-sm font-black">{formatRecordingClock(seconds)}</span>
      <LiveWaveform stream={stream} paused={paused} className="h-6 min-w-0 flex-1" />
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="kt-pressable flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-white/10 text-base text-rose-100 transition hover:bg-white/20"
          aria-label={cancelLabel}
        >
          <HiOutlineTrash />
        </button>
      ) : null}
    </div>
  );
}
