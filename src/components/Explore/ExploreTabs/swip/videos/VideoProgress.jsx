function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

  const rounded = Math.floor(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = String(rounded % 60).padStart(2, "0");

  return `${minutes}:${remainingSeconds}`;
}

export default function VideoProgress({ currentTime = 0, duration = 15, onSeek }) {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? Math.min(duration, 15) : 15;
  const safeCurrent = Math.min(Math.max(currentTime, 0), safeDuration);
  const progress = safeDuration > 0 ? Math.min(Math.max((safeCurrent / safeDuration) * 100, 0), 100) : 0;

  function stopVideoToggle(event) {
    event.stopPropagation();
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 px-4 pb-2 text-white sm:px-5" onClick={stopVideoToggle}>
      <div className="mb-1 flex items-center justify-between text-[11px] font-black tabular-nums text-white/90 drop-shadow">
        <span>{formatTime(safeCurrent)}</span>
        <span>{formatTime(safeDuration)}</span>
      </div>

      <div className="pointer-events-none relative">
        <div className="h-1 overflow-hidden rounded-full bg-white/24">
          <div className="h-full rounded-full bg-white transition-[width] duration-150 ease-linear" style={{ width: `${progress}%` }} />
        </div>
        <span className="absolute top-1/2 h-3 w-3 rounded-full bg-white shadow-[0_0_0_3px_rgba(15,23,42,0.35)]" style={{ left: `${progress}%`, transform: "translate(-50%, -50%)" }} />
      </div>

      <input
        type="range"
        min="0"
        max={safeDuration}
        step="0.01"
        value={safeCurrent}
        aria-label="Video position"
        onChange={(event) => onSeek?.(Number(event.target.value))}
        onInput={(event) => onSeek?.(Number(event.currentTarget.value))}
        onClick={stopVideoToggle}
        onPointerDown={stopVideoToggle}
        onPointerMove={stopVideoToggle}
        onPointerUp={stopVideoToggle}
        onTouchEnd={stopVideoToggle}
        onTouchMove={stopVideoToggle}
        onTouchStart={stopVideoToggle}
        className="absolute inset-x-4 bottom-0 h-8 cursor-pointer touch-none appearance-none bg-transparent opacity-0 sm:inset-x-5"
      />
    </div>
  );
}