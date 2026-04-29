const FILTERS = [
  { id: "all", label: "All" },
  { id: "feed", label: "Feed" },
  { id: "swip", label: "Swip" },
  { id: "people", label: "People" },
  { id: "hashtag", label: "Hashtags" },
];

export default function SearchFilters({ active, onChange }) {
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
          {item.label}
        </button>
      ))}
    </div>
  );
}
