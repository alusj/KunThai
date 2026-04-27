// =====================================
// AlertButton.jsx
// Notifications shortcut
// =====================================

import { HiOutlineBellAlert } from "react-icons/hi2";

export default function AlertButton({ onClick, count = 0, latestMessage = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-xl text-slate-700 transition hover:bg-slate-100 hover:text-slate-950"
      aria-label="Alerts"
      title={latestMessage || "Notifications"}
    >
      <HiOutlineBellAlert />
      {count > 0 ? (
        <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </button>
  );
}
