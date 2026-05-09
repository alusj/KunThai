/*
  FeedTabs (CHILD TABS)
  --------------------
  Contextual filters inside UrFeed.
  Subtle, lightweight UI.
*/

export default function FeedTabs({ activeTab, setActiveTab }) {
  return (
    <div className="sticky top-0 z-20 border-b border-white/50 bg-transparent">
      <div className="grid w-full grid-cols-2 px-3 pt-3 sm:px-5 lg:px-8">
      {["feed", "connections"].map(tab => {
        const isActive = activeTab === tab;

        return (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              relative rounded-full px-4 pb-3 pt-2 text-sm font-medium transition
              ${
                isActive
                  ? "bg-white/25 text-sky-800 after:absolute after:bottom-0 after:left-6 after:right-6 after:h-0.5 after:rounded-full after:bg-sky-700"
                  : "bg-transparent text-slate-500 hover:bg-white/20 hover:text-slate-800"
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
