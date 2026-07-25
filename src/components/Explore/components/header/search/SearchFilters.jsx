import { useI18n } from "../../../../../i18n";

// Swip is a brand name and stays untranslated; the rest resolve from i18n.
const FILTERS = [
  { id: "all", labelKey: "explore.filterAll" },
  { id: "feed", labelKey: "explore.filterFeed" },
  { id: "swip", label: "Swip" },
  { id: "people", labelKey: "explore.filterPeople" },
  { id: "hashtag", labelKey: "explore.filterHashtags" },
];

export default function SearchFilters({ active, onChange }) {
  const { t } = useI18n();
  return (
    <div className="flex gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {FILTERS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={`h-9 flex-none rounded-2xl px-4 text-sm font-bold transition ${
            active === item.id ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {item.labelKey ? t(item.labelKey) : item.label}
        </button>
      ))}
    </div>
  );
}
