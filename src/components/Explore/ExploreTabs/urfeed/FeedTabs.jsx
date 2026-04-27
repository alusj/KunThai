/*
  FeedTabs (CHILD TABS)
  --------------------
  Contextual filters inside UrFeed.
  Subtle, lightweight UI.
*/

export default function FeedTabs({ activeTab, setActiveTab }) {
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="grid w-full grid-cols-2 px-3 pt-3">
      {["feed", "connections"].map(tab => {
        const isActive = activeTab === tab;

        return (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              relative px-4 pb-3 pt-2 text-sm font-medium transition
              ${
                isActive
                  ? "text-sky-700 after:absolute after:bottom-0 after:left-6 after:right-6 after:h-0.5 after:rounded-full after:bg-sky-700"
                  : "text-slate-500 hover:text-slate-800"
              }
            `}
          >
            {tab === "feed" ? "Feed" : "Connections"}
          </button>
        );
      })}
      </div>
    </div>
  );
}
