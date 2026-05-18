const MARKETPLACE_TABS = [
  { id: "new", label: "New" },
  { id: "discounted", label: "Discounted" },
  { id: "high-demand", label: "High Demand" },
  { id: "top-rated", label: "Top Rated" },
];

export default function ParentTabs({ activeTab, setActiveTab }) {
  return (
    <div className="kt-header-glass sticky top-14 z-10 px-2">
      <div className="flex flex-nowrap gap-2 overflow-x-auto py-2 no-scrollbar">
        {MARKETPLACE_TABS.map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`kt-touchable min-w-[140px] flex-1 rounded-xl px-4 py-2 text-sm font-black transition ${
                isActive
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
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
