import { createElement } from "react";
import { HiOutlineChevronRight } from "react-icons/hi2";

export default function MenuActionButton({ description = "", icon, label, tone = "default", onClick }) {
  const toneClass =
    tone === "danger"
      ? "text-rose-700 hover:bg-rose-50"
      : tone === "strong"
        ? "text-slate-950 hover:bg-slate-100"
        : "text-slate-700 hover:bg-slate-100";
  const iconClass = tone === "danger" ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition sm:px-4 ${toneClass}`}
    >
      <span className={`grid h-11 w-11 flex-none place-items-center rounded-2xl ${iconClass}`}>
        {createElement(icon, { className: "text-xl" })}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black sm:text-base">{label}</span>
        {description ? <span className="mt-0.5 block text-xs font-semibold leading-5 text-slate-500">{description}</span> : null}
      </span>
      <HiOutlineChevronRight className="flex-none text-lg text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-sky-600" />
    </button>
  );
}
