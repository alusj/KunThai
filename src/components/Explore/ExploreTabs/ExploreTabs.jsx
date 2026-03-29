/*
  ExploreTabs (PARENT TABS)
  ------------------------
  Main navigation inside Explore.
  Strong visual weight.
*/

const TABS = ["UrFeed", "Swip", "Connections", "Notifications"];

export default function ExploreTabs({ activeTab, setActiveTab }) {
  return (
    <div className="flex gap-2 px-3 py-2 bg-white border-b">
      {TABS.map(tab => {
        const isActive = activeTab === tab;

        return (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              flex-1 py-2 rounded-full text-sm font-medium transition
              ${
                isActive
                  ? "bg-blue-600 text-white shadow"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }
            `}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
 