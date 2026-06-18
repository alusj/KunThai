import { HiOutlineMicrophone, HiOutlinePause, HiOutlinePlay, HiOutlineTrash, HiOutlineShieldCheck } from "react-icons/hi2";

function formatTime(seconds = 0) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export default function VoiceCapsuleRecorder({
  isRecording,
  isPaused,
  duration,
  audioPreview,
  onStart,
  onStop,
  onPause,
  onResume,
  onCancel,
}) {
  const bars = Array.from({ length: 18 });

  return (
    <div className="rounded-[26px] border border-sky-100 bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 p-4 text-white shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-sky-300">
            KunThai Voice Capsule
          </p>
          <h3 className="mt-1 text-base font-black">
            {isRecording ? "Recording your voice" : audioPreview ? "Voice ready" : "Record a voice thought"}
          </h3>
        </div>

        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-xl text-sky-200">
          <HiOutlineShieldCheck />
        </span>
      </div>

      <div className="mt-5 flex h-16 items-end gap-1.5 rounded-3xl bg-white/10 px-4 py-3">
        {bars.map((_, index) => (
          <span
            key={index}
            className={`w-full rounded-full bg-sky-300 transition-all ${
              isRecording && !isPaused ? "animate-pulse" : "opacity-40"
            }`}
            style={{
              height: `${18 + ((index * 13) % 42)}px`,
              animationDelay: `${index * 70}ms`,
            }}
          />
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-sky-100">
          {formatTime(duration)}
        </span>

        <span className="text-xs font-bold text-sky-200">
          Ready to publish when you are
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
              Start Capsule
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onStop}
            className="col-span-2 h-12 rounded-2xl bg-emerald-400 text-sm font-black text-slate-950"
          >
            Save Voice
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
