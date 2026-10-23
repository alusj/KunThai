import { ChevronRight } from "lucide-react";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../../../i18n/index.js";

const TONES = {
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  sky: "bg-sky-50 text-sky-700",
  danger: "bg-rose-50 text-rose-600",
};

export default function SellerDrawerNavItem({
  icon: Icon,
  title,
  description,
  badge,
  tone = "emerald",
  danger = false,
  onClick,
}) {
  useUiLocale();
  return (
    <button
      type="button"
      onClick={onClick}
      className="kt-touchable flex min-h-[64px] w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-gray-50 active:bg-gray-100"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONES[danger ? "danger" : tone] || TONES.emerald}`}>
        <Icon size={19} strokeWidth={2.2} />
      </span>

      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[15px] font-black ${danger ? "text-rose-600" : "text-gray-950"}`}>
          {translateUi(title)}
        </span>
        {description ? (
          <span className="mt-0.5 block line-clamp-2 text-xs font-semibold leading-5 text-gray-500">
            {translateUi(description)}
          </span>
        ) : null}
      </span>

      {badge ? (
        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">
          {badge}
        </span>
      ) : null}

      <ChevronRight className="shrink-0 text-gray-300" size={18} />
    </button>
  );
}
