/**
 * ParentTabs.jsx
 * ----------------
 * Buyer tabs: Browse, Orders, Messages
 * - Full-width on desktop
 * - Scrollable on small screens
 * - Soft rounded edges (no sharp corners)
 * - Consistent colors across devices
 */

export default function ParentTabs({ activeTab, setActiveTab }) {
  const tabs = [
    { id: "browse", label: "Browse" },
    { id: "orders", label: "Orders" },
    { id: "messages", label: "Messages" },
  ];

  return (
    <div className="bg-white border-b px-2">

      {/* Wrapper */}
      <div className="flex flex-nowrap overflow-x-auto no-scrollbar gap-2 py-2">

        {tabs.map(tab => {
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}

              className={`
                appearance-none
                focus:outline-none
                flex-1 min-w-[120px]

                px-4 py-2
                text-sm font-medium
                transition-all duration-200

                rounded-xl

                ${
                  isActive
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }
              `}
            >
              {tab.label}
            </button>
          );
        })}

      </div>
    </div>
  );
}
