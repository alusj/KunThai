import { HiOutlineSparkles } from "react-icons/hi2";

import { useAiAvailability } from "../../../Backend/hooks/useAiTask";
import { openAiAssistant } from "../../../Backend/services/ai/aiSurfaceService";
import { useI18n } from "../../../i18n";

// KAI — the one AI entry point Explore screens use.
//
// Opens the shared assistant sheet with a request built at the moment of the
// tap (so it always carries the latest draft), and hides itself entirely when
// AI is switched off or the visitor is a guest.
//
// Variants match the controls they sit beside:
//   tool — the composer's @ / # / topic chips
//   icon — the 44px square buttons in the comment box

export default function ExploreAiButton({ variant = "tool", getRequest, label = "", disabled = false, className = "" }) {
  const { t } = useI18n();
  const { available, checked } = useAiAvailability();

  if (!checked || !available) return null;

  function open() {
    const request = typeof getRequest === "function" ? getRequest() : null;
    if (!request) return;
    openAiAssistant({ surface: "explore", ...request });
  }

  const text = label || t("ai.assist");

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={open}
        disabled={disabled}
        aria-label={text}
        title={text}
        className={`kt-pressable flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-indigo-50 text-lg text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50 ${className}`}
      >
        <HiOutlineSparkles />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={disabled}
      className={`inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-black text-indigo-700 shadow-sm ring-1 ring-indigo-100 transition hover:bg-indigo-50 disabled:opacity-50 ${className}`}
    >
      <HiOutlineSparkles className="text-base" /> {text}
    </button>
  );
}
