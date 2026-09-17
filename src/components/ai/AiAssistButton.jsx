import { Sparkles } from "lucide-react";

import { useI18n } from "../../i18n";
import { useAiAvailability } from "../../Backend/hooks/useAiTask";
import { openAiAssistant, openAiChat } from "../../Backend/services/ai/aiSurfaceService";

// KAI — the standard way a screen offers AI help.
//
// The request is built at the moment of the tap (`getRequest`), so it always
// carries the latest draft or data on screen. `chat` opens the conversational
// assistant instead of the single-task sheet. The button hides itself when AI
// is off for the deployment or the visitor is a guest, so a screen never shows
// an AI control that cannot work.

const VARIANTS = {
  soft: "border border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
  dark: "border border-white/15 bg-white/10 text-white hover:bg-white/20",
  outline: "border border-gray-200 bg-white text-indigo-700 hover:bg-indigo-50",
};

const SIZES = {
  sm: "h-8 gap-1 px-2.5 text-[11px]",
  md: "h-10 gap-1.5 px-3 text-xs",
  icon: "h-10 w-10 justify-center",
};

export default function AiAssistButton({
  getRequest,
  chat = false,
  label = "",
  variant = "soft",
  size = "sm",
  className = "",
  disabled = false,
}) {
  const { t } = useI18n();
  const { available, checked } = useAiAvailability();

  if (!checked || !available) return null;

  function open() {
    const request = typeof getRequest === "function" ? getRequest() : {};
    if (!request) return;
    if (chat) openAiChat(request);
    else openAiAssistant(request);
  }

  const text = label || t("ai.assist");

  return (
    <button
      type="button"
      onClick={open}
      disabled={disabled}
      aria-label={text}
      title={text}
      className={`kt-pressable inline-flex flex-none items-center rounded-xl font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant] || VARIANTS.soft} ${SIZES[size] || SIZES.sm} ${className}`}
    >
      <Sparkles size={size === "sm" ? 12 : 15} />
      {size === "icon" ? null : <span>{text}</span>}
    </button>
  );
}
