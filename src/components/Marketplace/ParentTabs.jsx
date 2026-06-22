const MARKETPLACE_TABS = [
  { id: "new", label: "New" },
  { id: "discounted", label: "Discounted" },
  { id: "high-demand", label: "High Demand" },
  { id: "top-rated", label: "Top Rated" },
];

export default function ParentTabs({ activeTab, setActiveTab }) {
  const activeIndex = Math.max(0, MARKETPLACE_TABS.findIndex((tab) => tab.id === activeTab));
  return (
    <div className="sticky top-16 z-10 border-y border-white/70 bg-white/50 px-2 py-2 shadow-sm backdrop-blur-2xl supports-[backdrop-filter]:bg-white/40">
      <div className="relative grid grid-cols-4 gap-1 rounded-[24px] border border-white/80 bg-white/55 p-1 ring-1 ring-slate-950/5">
        <span
          className="pointer-events-none absolute bottom-1 top-1 rounded-[20px] bg-emerald-600/95 shadow-md shadow-emerald-900/15 transition-[left] duration-300 ease-out"
          style={{
            left: `calc(0.25rem + ${activeIndex} * ((100% - 1.25rem) / 4 + 0.25rem))`,
            width: "calc((100% - 1.25rem) / 4)",
          }}
          aria-hidden="true"
        />
        {MARKETPLACE_TABS.map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`kt-pressable relative z-10 min-h-10 min-w-0 rounded-[18px] px-1 py-1.5 text-[11px] font-black leading-tight transition sm:text-xs ${
                isActive
                  ? "text-white"
                  : "text-gray-600 hover:bg-white/70 hover:text-gray-950"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
