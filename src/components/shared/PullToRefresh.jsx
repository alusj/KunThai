import { useRef, useState } from "react";
import { ArrowDown, LoaderCircle } from "lucide-react";

import { haptics } from "../../Backend/services/feedbackService";

const PULL_THRESHOLD = 70;
const MAX_PULL = 110;

// Touch pull-to-refresh for the main list screens. Activates only when the
// page is scrolled to the top so it never fights normal scrolling.
export default function PullToRefresh({ children, className = "", disabled = false, onRefresh }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);

  function handleTouchStart(event) {
    if (disabled || refreshing || window.scrollY > 4) return;
    startYRef.current = event.touches[0].clientY;
    pullingRef.current = true;
  }

  function handleTouchMove(event) {
    if (!pullingRef.current || refreshing) return;
    if (window.scrollY > 4) {
      pullingRef.current = false;
      setPull(0);
      return;
    }
    const delta = event.touches[0].clientY - startYRef.current;
    setPull(delta > 0 ? Math.min(delta * 0.45, MAX_PULL) : 0);
  }

  async function handleTouchEnd() {
    if (!pullingRef.current) return;
    pullingRef.current = false;

    if (pull >= PULL_THRESHOLD && !refreshing) {
      setPull(0);
      setRefreshing(true);
      haptics.light();
      try {
        await onRefresh?.();
      } finally {
        setRefreshing(false);
      }
      return;
    }
    setPull(0);
  }

  const indicatorHeight = refreshing ? 52 : pull;
  const armed = pull >= PULL_THRESHOLD;

  return (
    <div
      className={className}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div
        aria-hidden={!refreshing && !pull}
        className="flex items-end justify-center overflow-hidden transition-[height] duration-150"
        style={{ height: `${indicatorHeight}px` }}
      >
        <span className={`mb-2 grid h-9 w-9 place-items-center rounded-full border shadow-sm ${armed || refreshing ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-400"}`}>
          {refreshing ? (
            <LoaderCircle size={18} className="animate-spin" />
          ) : (
            <ArrowDown size={18} className={`transition-transform ${armed ? "rotate-180" : ""}`} />
          )}
        </span>
      </div>
      {children}
    </div>
  );
}
