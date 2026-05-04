export default function SellerWorkspaceTabs({ activeTab, onTabChange }) {
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "sales", label: "Sales & Orders" },
    { id: "messages", label: "Messages" },
    { id: "store", label: "Store" },
    { id: "catalog", label: "Catalog" },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`min-w-[132px] flex-1 whitespace-nowrap rounded-lg px-4 py-3 text-sm font-black transition ${
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
