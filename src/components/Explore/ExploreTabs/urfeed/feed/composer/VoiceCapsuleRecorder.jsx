import { HiOutlineMicrophone, HiOutlinePause, HiOutlinePlay, HiOutlineTrash, HiOutlineShieldCheck, HiStop } from "react-icons/hi2";

import { LiveWaveform } from "../../../../../shared/recording/LiveRecording";

import { t } from "../../../../../../i18n";
import { t as i18nText } from "../../../../../../i18n/index";
import { useI18n as useUiLocale } from "../../../../../../i18n/index.js";

function formatTime(seconds = 0) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export default function VoiceCapsuleRecorder({
  isRecording,
  isPaused,
  stream,
  duration,
  audioPreview,
  onStart,
  onStop,
  onPause,
  onResume,
  onCancel,
}) {
  useUiLocale();
  const bars = Array.from({ length: 18 });

  return (
    <div className="rounded-[26px] border border-sky-100 bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 p-4 text-white shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-sky-300">
            {i18nText("ui.literals.k0eed5d69e607")}
          </p>
          <h3 className="mt-1 text-base font-black">
            {isRecording ? t("explore.recordingVoice") : audioPreview ? t("explore.voiceReady") : t("explore.recordVoiceThought")}
          </h3>
        </div>

        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-xl text-sky-200">
          <HiOutlineShieldCheck />
        </span>
      </div>

      {isRecording ? (
        <div data-paused={isPaused ? "true" : "false"} className="kt-rec-strip mt-5 flex h-16 items-center gap-3 rounded-3xl px-4">
          <span className="kt-rec-dot" />
          <LiveWaveform stream={stream} paused={isPaused} bars={36} className="h-11 min-w-0 flex-1" />
        </div>
      ) : (
        <div className="mt-5 flex h-16 items-center gap-1.5 rounded-3xl bg-white/10 px-4 py-3">
          {bars.map((_, index) => (
            <span
              key={index}
              className="w-full rounded-full bg-sky-300 opacity-40"
              style={{ height: `${8 + ((index * 13) % 34)}px` }}
            />
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className={`kt-rec-time rounded-full px-3 py-1 text-xs font-black ${isRecording && !isPaused ? "bg-rose-500/20 text-rose-100" : "bg-white/10 text-sky-100"}`}>
          {formatTime(duration)}
        </span>

        <span className="text-xs font-bold text-sky-200">
          {i18nText("ui.literals.k0afc8e5eb418")}
        </span>
      </div>

      {audioPreview ? (
        <audio src={audioPreview} controls className="mt-4 h-10 w-full" />
      ) : null}

      <div className="mt-5 grid grid-cols-3 gap-2">
        {!isRecording ? (
          <button
            type="button"
            onClick={onStart}
            className="col-span-2 h-12 rounded-2xl bg-sky-400 text-sm font-black text-slate-950"
          >
            <span className="inline-flex items-center gap-2">
              <HiOutlineMicrophone />
              {i18nText("ui.literals.ked90a0ec0170")}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onStop}
            className={`col-span-2 h-12 rounded-2xl text-sm font-black ${isPaused ? "bg-emerald-400 text-slate-950" : "kt-rec-button"}`}
          >
            <span className="inline-flex items-center gap-2">
              <HiStop />
              {i18nText("ui.literals.kc6f7f44e5b6b")}
            </span>
          </button>
        )}

        {isRecording ? (
          <button
            type="button"
            onClick={isPaused ? onResume : onPause}
            className="h-12 rounded-2xl bg-white/10 text-xl text-white"
          >
            {isPaused ? <HiOutlinePlay /> : <HiOutlinePause />}
          </button>
        ) : (
          <button
            type="button"
            onClick={onCancel}
            disabled={!audioPreview}
            className="h-12 rounded-2xl bg-white/10 text-xl text-white disabled:opacity-30"
          >
            <HiOutlineTrash />
          </button>
        )}
      </div>
    </div>
  );
}
