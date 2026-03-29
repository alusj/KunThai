// src/components/Marketplace/Browse/BrowseTabs.jsx

const BROWSE_TABS = [
  { id: "new", label: "New"},
  { id: "discounted", label: "Discounted"},
  { id: "high-demand", label: "High Demand"},
  { id: "top-rated", label: "Top Rated"},
];

export default function BrowseTabs({ activeTab, setActiveTab }) {
  return (
    <div className="sticky top-[104px] z-10 bg-white border-b">

      {/* =========================
          Full-width scrollable tabs
      ========================= */}
      <div className="flex w-full overflow-x-auto no-scrollbar">
        {BROWSE_TABS.map(tab => {
          const active = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-[140px] flex items-center justify-center gap-2
                px-4 py-2 text-sm font-medium border-b-2 transition
                ${
                  active
                    ? "border-emerald-600 text-emerald-600"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                }`}
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

    </div>
  );
}
