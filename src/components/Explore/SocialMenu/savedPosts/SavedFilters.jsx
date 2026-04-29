const FILTERS = [
  { id: "all", label: "All" },
  { id: "feed", label: "Feed" },
  { id: "swip", label: "Swip" },
];

export default function SavedFilters({ active, collections, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {FILTERS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={`h-10 flex-none rounded-2xl px-4 text-sm font-black transition ${
            active === item.id ? "bg-slate-950 text-white" : "bg-white text-slate-600 shadow-sm hover:bg-slate-50"
          }`}
        >
          {item.label}
        </button>
      ))}
      {collections.map((collection) => (
        <button
          key={collection.id}
          type="button"
          onClick={() => onChange(collection.id)}
          className={`h-10 flex-none rounded-2xl px-4 text-sm font-black transition ${
            active === collection.id ? "bg-sky-700 text-white" : "bg-white text-slate-600 shadow-sm hover:bg-slate-50"
          }`}
        >
          {collection.name}
        </button>
      ))}
    </div>
  );
}
