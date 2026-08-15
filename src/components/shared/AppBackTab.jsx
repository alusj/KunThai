import { useCallback } from "react";
import { ChevronLeft } from "lucide-react";

import { useBrowserBack } from "../../Backend/hooks/useBrowserBack";
import { useBackSwipeRegistration } from "../../Backend/hooks/useBackSwipe";

export default function AppBackTab({
  onBack,
  label = "Back",
  historyKey = "kuntai-screen",
  className = "",
  iconSize = 36,
  useHistoryLayer = true,
  enableSwipe = true,
  swipeOptions,
  style,
}) {
  const goBack = useBrowserBack(Boolean(onBack && useHistoryLayer), onBack, historyKey);
  const handleBack = useCallback(() => {
    if (useHistoryLayer) {
      goBack?.();
      return;
    }

    onBack?.();
  }, [goBack, onBack, useHistoryLayer]);

  const handleSwipeBack = handleBack;

  const swipeRegistrationRef = useBackSwipeRegistration(Boolean(onBack && enableSwipe), handleSwipeBack, swipeOptions);

  if (!onBack) return null;

  return (
    <button
      ref={swipeRegistrationRef}
      type="button"
      onClick={handleBack}
      aria-label={label}
      data-back-swipe-control="true"
      className={`kt-touchable flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-transparent bg-transparent text-slate-900 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${className}`}
      style={style}
    >
      <ChevronLeft size={iconSize} strokeWidth={4.5} absoluteStrokeWidth aria-hidden="true" />
    </button>
  );
}
