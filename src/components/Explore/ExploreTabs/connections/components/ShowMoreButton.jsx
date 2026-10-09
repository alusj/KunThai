import { t as i18nText } from "../../../../../i18n/index";

// "Show more" under a connections list that renders a page at a time.
export default function ShowMoreButton({ connectionState }) {
  if (!connectionState?.hasMoreItems) return null;
  return (
    <button
      type="button"
      onClick={connectionState.showMore}
      className="mt-3 h-11 w-full rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
    >
      {i18nText("exploreMessagesFix.showMore")}
    </button>
  );
}
