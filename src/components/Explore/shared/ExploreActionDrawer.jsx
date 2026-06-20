import { createPortal } from "react-dom";
import { X } from "lucide-react";

import useBodyScrollLock from "../../shared/useBodyScrollLock";

export default function ExploreActionDrawer({ children, closing = false, onClose, title = "Actions" }) {
  useBodyScrollLock(true);

  return createPortal(
    <div className="fixed inset-0 z-[105]" role="presentation">
      <button
        type="button"
        aria-label={`Close ${title}`}
        onClick={onClose}
        className={`absolute inset-0 bg-slate-950/30 backdrop-blur-[2px] ${closing ? "opacity-0 transition-opacity duration-200" : "opacity-100"}`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`${closing ? "kt-toast-collapse-out" : "kt-toast-expand-in"} fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] flex w-[min(84vw,360px)] flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white/75 text-slate-950 shadow-[0_28px_90px_rgba(15,23,42,0.30)] backdrop-blur-2xl sm:right-5`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="kt-pressable absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/80 text-slate-700 shadow-lg backdrop-blur-xl"
          aria-label={`Close ${title}`}
        >
          <X size={18} strokeWidth={2.4} />
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-16">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
