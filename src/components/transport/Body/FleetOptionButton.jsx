
import { uiText as translateUi, useI18n as useUiLocale } from "../../../i18n/index.js";export default function FleetOptionButton({ icon, label, onClick }) {
  useUiLocale();
  return (
    <button
      type="button"
      aria-label={translateUi(label)}
      title={translateUi(label)}
      onClick={onClick}
      className="
        flex min-h-16 min-w-0 flex-col items-center justify-center
        rounded-2xl border border-amber-100 bg-amber-50/70 px-2 py-3
        text-slate-800 shadow-sm shadow-amber-100/60
        hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 hover:shadow-md
        transition-all
      "
    >
      <span className="flex h-7 items-center text-2xl leading-none">{icon}</span>
      <span className="mt-1 max-w-full truncate text-[11px] font-black leading-tight sm:text-xs">
        {translateUi(label)}
      </span>
    </button>
  );
}
