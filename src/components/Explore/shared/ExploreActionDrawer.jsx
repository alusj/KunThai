import { createPortal } from "react-dom";
import { X } from "lucide-react";

export default function ExploreActionDrawer({ children, closing = false, onClose, title = "Actions" }) {
  return createPortal(
    <div
      className="fixed inset-0 z-[105] h-dvh w-full overflow-hidden overscroll-none [contain:strict]"
      role="presentation"
    >
      <button
        type="button"
        aria-label={`Close ${title}`}
        onClick={onClose}
        className={`absolute inset-0 touch-none bg-slate-950/35 backdrop-blur-[2px] ${
          closing ? "opacity-0 transition-opacity duration-200" : "opacity-100"
        }`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`${closing ? "kt-toast-collapse-out" : "kt-toast-expand-in"} absolute right-3 top-16 max-h-[calc(100dvh-5rem)] w-fit max-w-[90vw] transform-gpu overflow-y-auto overscroll-contain [backface-visibility:hidden] [will-change:transform,opacity] sm:right-5`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="kt-pressable absolute -right-1 -top-12 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-slate-700 shadow-lg backdrop-blur-xl"
          aria-label={`Close ${title}`}
        >
          <X size={18} strokeWidth={2.4} />
        </button>

        {children}
      </aside>
    </div>,
    document.body,
  );
}
