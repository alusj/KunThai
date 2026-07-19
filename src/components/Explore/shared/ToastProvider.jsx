import { useEffect, useRef, useState } from "react";
import { HiOutlineCheckCircle, HiOutlineExclamationTriangle, HiOutlineInformationCircle, HiOutlineXMark } from "react-icons/hi2";

import { TOAST_EVENT } from "../../../Backend/services/toastService";

const TOAST_EXIT_MS = 280;

// Position a small pointer on the toast aimed at the control that triggered it.
// Origin is the last pointer press in viewport coordinates; the toast stack is
// top-centered, so presses above the card get a top arrow, presses below a
// bottom arrow, horizontally aligned with the source icon.
function getToastArrow(origin) {
  if (!origin || typeof window === "undefined") return null;
  const viewportWidth = window.innerWidth || 0;
  if (!viewportWidth) return null;

  const cardWidth = Math.min(viewportWidth * 0.92, 420);
  const cardLeft = (viewportWidth - cardWidth) / 2;
  const x = Math.min(Math.max(origin.x - cardLeft, 22), cardWidth - 22);
  const side = origin.y < 130 ? "top" : "bottom";
  return { x, side };
}

const tones = {
  info: {
    icon: HiOutlineInformationCircle,
    title: "Update",
    accentClass: "from-sky-500 to-blue-600",
    iconClass: "bg-sky-50 text-sky-700 ring-sky-100",
  },
  success: {
    icon: HiOutlineCheckCircle,
    title: "Done",
    accentClass: "from-emerald-500 to-teal-600",
    iconClass: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  },
  warning: {
    icon: HiOutlineExclamationTriangle,
    title: "Attention",
    accentClass: "from-amber-400 to-orange-500",
    iconClass: "bg-amber-50 text-amber-700 ring-amber-100",
  },
  danger: {
    icon: HiOutlineExclamationTriangle,
    title: "Action needed",
    accentClass: "from-rose-500 to-red-600",
    iconClass: "bg-rose-50 text-rose-700 ring-rose-100",
  },
  error: {
    icon: HiOutlineExclamationTriangle,
    title: "Action needed",
    accentClass: "from-rose-500 to-red-600",
    iconClass: "bg-rose-50 text-rose-700 ring-rose-100",
  },
};

export default function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const timersRef = useRef(new Map());

  function dismissToast(id) {
    if (!id) return;

    const existingTimer = timersRef.current.get(id);
    if (existingTimer) window.clearTimeout(existingTimer);

    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, leaving: true } : item)),
    );

    const removalTimer = window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
      timersRef.current.delete(id);
    }, TOAST_EXIT_MS);
    timersRef.current.set(id, removalTimer);
  }

  useEffect(() => {
    const timers = timersRef.current;

    function handleToast(event) {
      const toast = { ...(event.detail || {}), leaving: false };
      setItems((current) => [toast, ...current].slice(0, 4));
      const timer = window.setTimeout(() => dismissToast(toast.id), Number(toast.duration || 3600));
      timers.set(toast.id, timer);
    }

    window.addEventListener(TOAST_EVENT, handleToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, handleToast);
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  return (
    <>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[1200] flex flex-col items-center gap-2 px-3 sm:top-5">
        {items.map((item, index) => {
          const tone = tones[item.tone] || tones.info;
          const Icon = tone.icon;
          const motionClass = item.leaving
            ? item.anchor === "notification"
              ? "kt-toast-collapse-notification"
              : "kt-toast-collapse-out"
            : "kt-toast-expand-in";
          const arrow = index === 0 ? getToastArrow(item.origin) : null;
          return (
            <div
              key={item.id}
              role="status"
              style={arrow ? { transformOrigin: `${arrow.x}px ${arrow.side === "top" ? "0%" : "100%"}` } : undefined}
              className={`${motionClass} pointer-events-auto relative flex w-full max-w-[min(92vw,420px)] rounded-[26px] border border-white/70 bg-white/95 p-1 text-slate-900 shadow-[0_24px_70px_rgba(15,23,42,0.20)] ring-1 ring-slate-950/5 backdrop-blur-xl`}
            >
              {arrow ? (
                <span
                  aria-hidden="true"
                  style={{ left: `${arrow.x}px` }}
                  className={`absolute h-3 w-3 -translate-x-1/2 rotate-45 border-white/70 bg-white/95 ring-slate-950/5 ${
                    arrow.side === "top" ? "-top-1.5 border-l border-t" : "-bottom-1.5 border-b border-r"
                  }`}
                />
              ) : null}
              <div className={`w-1.5 shrink-0 rounded-full bg-gradient-to-b ${tone.accentClass}`} />
              <div className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3">
                <span className={`mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-2xl ring-1 ${tone.iconClass}`}>
                  <Icon className="text-xl" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{item.title || tone.title}</p>
                  <p className={`kuntai-break mt-1 text-sm font-black leading-5 text-slate-950 ${item.allowLongMessage ? "" : "line-clamp-2"}`}>
                    {item.message}
                  </p>
                  {item.actionLabel && item.onAction ? (
                    <button
                      type="button"
                      onClick={() => {
                        item.onAction?.();
                        dismissToast(item.id);
                      }}
                      className="kt-pressable mt-3 rounded-2xl bg-slate-950 px-4 py-2 text-xs font-black text-white"
                    >
                      {item.actionLabel}
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(item.id)}
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
                  aria-label="Dismiss message"
                >
                  <HiOutlineXMark />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
