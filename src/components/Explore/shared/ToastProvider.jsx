import { useEffect, useState } from "react";
import { HiOutlineCheckCircle, HiOutlineExclamationTriangle, HiOutlineInformationCircle, HiOutlineXMark } from "react-icons/hi2";

import { TOAST_EVENT } from "../../../Backend/services/toastService";

const tones = {
  info: {
    icon: HiOutlineInformationCircle,
    className: "border-sky-100 bg-white text-slate-800",
    iconClass: "text-sky-600",
  },
  success: {
    icon: HiOutlineCheckCircle,
    className: "border-emerald-100 bg-white text-slate-800",
    iconClass: "text-emerald-600",
  },
  danger: {
    icon: HiOutlineExclamationTriangle,
    className: "border-rose-100 bg-white text-slate-800",
    iconClass: "text-rose-600",
  },
  error: {
    icon: HiOutlineExclamationTriangle,
    className: "border-rose-100 bg-white text-slate-800",
    iconClass: "text-rose-600",
  },
};

export default function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    function handleToast(event) {
      const toast = event.detail || {};
      setItems((current) => [toast, ...current].slice(0, 4));
      setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== toast.id));
      }, 3600);
    }

    window.addEventListener(TOAST_EVENT, handleToast);
    return () => window.removeEventListener(TOAST_EVENT, handleToast);
  }, []);

  return (
    <>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[1200] flex flex-col items-center gap-2 px-3 sm:top-5">
        {items.map((item) => {
          const tone = tones[item.tone] || tones.info;
          const Icon = tone.icon;
          return (
            <div
              key={item.id}
              className={`kt-toast-pop pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-[18px] border px-3 py-3 text-sm font-bold shadow-2xl backdrop-blur transition ${tone.className}`}
            >
              <Icon className={`flex-none text-xl ${tone.iconClass}`} />
              <p className="kuntai-break min-w-0 flex-1 leading-5">{item.message}</p>
              {item.actionLabel && item.onAction ? (
                <button
                  type="button"
                  onClick={() => {
                    item.onAction?.();
                    setItems((current) => current.filter((toast) => toast.id !== item.id));
                  }}
                  className="flex-none rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white"
                >
                  {item.actionLabel}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setItems((current) => current.filter((toast) => toast.id !== item.id))}
                className="flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-slate-100 text-slate-500"
                aria-label="Dismiss message"
              >
                <HiOutlineXMark />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
