
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../../i18n/index.js";export default function HeaderActionButton({
  icon: Icon,
  label,
  badge,
  direction,
  primary = false,
  onClick,
}) {
  useUiLocale();
  return (
    <button
      type="button"
      onClick={onClick}
      data-direction={direction || undefined}
      className={[
        "relative flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition",
        primary
          ? "bg-gray-900 text-white hover:bg-gray-800"
          : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
      ].join(" ")}
      title={translateUi(label)}
      aria-label={translateUi(label)}
    >
      <Icon size={18} strokeWidth={2.3} />
      <span className="hidden lg:inline">{translateUi(label)}</span>
      {badge ? (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}
