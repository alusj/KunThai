// src/components/Marketplace/Browse/BrowseTabs.jsx

import { useI18n } from "../../../i18n";

const BROWSE_TABS = [
  { id: "new", labelKey: "urmall.tabs.new" },
  { id: "discounted", labelKey: "urmall.tabs.discounted" },
  { id: "high-demand", labelKey: "urmall.tabs.highDemand" },
  { id: "top-rated", labelKey: "urmall.tabs.topRated" },
];

export default function BrowseTabs({ activeTab, setActiveTab }) {
  const { t } = useI18n();
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
              <span>{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </div>

    </div>
  );
}
