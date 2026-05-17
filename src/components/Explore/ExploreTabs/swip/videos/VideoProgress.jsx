function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const rounded = Math.floor(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

export default function VideoProgress({ currentTime = 0, duration = 0 }) {
  const progress = duration > 0 ? Math.min(Math.max((currentTime / duration) * 100, 0), 100) : 0;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-4 pb-2 text-white sm:px-5">
      <div className="mb-1 flex items-center justify-between text-[11px] font-black tabular-nums text-white/90 drop-shadow">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/24">
        <div className="h-full rounded-full bg-white transition-[width] duration-150 ease-linear" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
