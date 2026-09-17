import { ArrowRight } from "lucide-react";

import { assistantActionLabel, isKnownAssistantAction } from "../../../Backend/services/ai/assistantActions";

// KAI — buttons for actions the assistant prepared. Nothing runs until
// the person presses one, and each opens a KunThai screen where any real
// commitment still needs its own confirmation.

export default function AiChatActionButtons({ actions, onRun }) {
  const list = (Array.isArray(actions) ? actions : []).filter(isKnownAssistantAction);
  if (!list.length) return null;

  const seen = new Set();
  const unique = list.filter((action) => {
    const key = JSON.stringify(action);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {unique.map((action) => (
        <button
          key={JSON.stringify(action)}
          type="button"
          onClick={() => onRun?.(action)}
          className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-black text-sky-800 transition hover:bg-sky-100"
        >
          {assistantActionLabel(action)}
          <ArrowRight size={12} />
        </button>
      ))}
    </div>
  );
}
