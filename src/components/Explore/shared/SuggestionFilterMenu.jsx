import { useState } from "react";
import { HiCheck, HiOutlineAdjustmentsHorizontal } from "react-icons/hi2";

import { SUGGESTION_FILTERS } from "../../../Backend/services/explore/suggestionFilters";
import { useI18n } from "../../../i18n";

const LABEL_KEYS = {
  recommended: "feed.filterRecommended",
  know: "feed.filterKnow",
  nearby: "feed.filterNearby",
  popular: "feed.filterPopular",
  new: "feed.filterNew",
};

// Small filter button + menu for suggested accounts (UrFeed card and
// Connections → Suggested). "Recommended" is the default ranked order.
export default function SuggestionFilterMenu({ value, onChange }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const active = value !== "recommended";

  function choose(next) {
    setOpen(false);
    onChange?.(next);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("feed.suggestionFilter")}
        className={`kt-pressable inline-flex h-9 max-w-[11rem] items-center gap-1.5 rounded-full px-3 text-xs font-black ${
          active ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
        }`}
      >
        <HiOutlineAdjustmentsHorizontal className="shrink-0 text-base" />
        <span className="truncate">{t(LABEL_KEYS[value] || LABEL_KEYS.recommended)}</span>
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
            aria-label={t("feed.suggestionFilter")}
            tabIndex={-1}
          />
          <div role="menu" className="kt-toast-expand-in absolute right-0 top-11 z-30 w-60 rounded-[20px] border border-slate-200 bg-white p-1.5 shadow-2xl">
            {SUGGESTION_FILTERS.map((option) => (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={value === option}
                onClick={() => choose(option)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-black text-slate-900 hover:bg-slate-100 ${
                  value === option ? "bg-slate-100" : ""
                }`}
              >
                <span className="min-w-0 flex-1">{t(LABEL_KEYS[option])}</span>
                {value === option ? <HiCheck className="shrink-0 text-base text-sky-700" /> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
