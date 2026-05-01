export default function SellerWorkspaceTabs({ activeTab, onTabChange }) {
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "store", label: "Store" },
    { id: "catalog", label: "Catalog" },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
      <div className="grid gap-2 sm:grid-cols-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`rounded-lg px-4 py-3 text-sm font-black transition ${
              activeTab === tab.id
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-950"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
