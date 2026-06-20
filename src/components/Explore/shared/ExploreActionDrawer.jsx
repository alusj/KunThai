import { createPortal } from "react-dom";
import { X } from "lucide-react";

import useBodyScrollLock from "../../shared/useBodyScrollLock";

export default function ExploreActionDrawer({ children, closing = false, eyebrow = "Explore", onClose, title = "Actions" }) {
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
        className={`${closing ? "kt-toast-collapse-out" : "kt-toast-expand-in"} fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] flex w-[min(84vw,360px)] flex-col overflow-hidden rounded-[28px] border border-white/80 bg-white/96 text-slate-950 shadow-[0_28px_90px_rgba(15,23,42,0.30)] ring-1 ring-slate-950/5 backdrop-blur-xl sm:right-5`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-700">{eyebrow}</p>
            <h3 className="mt-1 truncate text-lg font-black">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="kt-pressable grid h-10 w-10 flex-none place-items-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm"
            aria-label={`Close ${title}`}
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
