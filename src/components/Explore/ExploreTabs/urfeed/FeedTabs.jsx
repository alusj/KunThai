/*
  FeedTabs (CHILD TABS)
  --------------------
  Contextual filters inside UrFeed.
  Subtle, lightweight UI.
*/

export default function FeedTabs({ activeTab, setActiveTab }) {
  return (
    <div className="flex bg-white border-b">
      {["feed", "connections"].map(tab => {
        const isActive = activeTab === tab;

        return (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              flex-1 py-3 text-sm font-medium transition
              ${
                isActive
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-slate-500 hover:text-slate-700"
              }
            `}
          >
            {tab === "feed" ? "Feed" : "Connections"}
          </button>
        );
      })}
    </div>
  );
}
