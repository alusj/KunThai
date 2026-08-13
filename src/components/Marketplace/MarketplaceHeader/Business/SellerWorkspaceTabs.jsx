import { useI18n, t } from "../../../../i18n";

export default function SellerWorkspaceTabs({ activeTab, onTabChange, allowedTabs = null }) {
  useI18n();
  const allTabs = [
    { id: "store", label: t("urmall.biz.cat.titleStore") },
    { id: "catalog", label: t("urmall.biz.cat.titleCatalog") },
    { id: "drafts", label: t("urmall.biz.cat.titleDraft") },
  ];
  // When an admin only has some responsibilities, show just the tabs they can use.
  const tabs = allowedTabs ? allTabs.filter((tab) => allowedTabs.includes(tab.id)) : allTabs;

  return (
    <nav aria-label={t("urmall.biz.cat.titleStore")} className="rounded-2xl border border-gray-200 bg-white p-1.5 shadow-sm">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, tabs.length)}, minmax(0, 1fr))` }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`min-w-0 whitespace-nowrap rounded-xl px-2 py-3 text-xs font-black transition-all duration-300 sm:px-4 sm:text-sm ${
              activeTab === tab.id
                ? "bg-slate-950 text-white shadow-lg shadow-slate-950/15"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-950"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
