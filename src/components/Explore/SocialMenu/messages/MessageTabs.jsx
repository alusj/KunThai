export default function MessageTabs({ active, counts, onChange }) {
  const tabs = [
    { id: "inbox", label: "Inbox", count: counts.inbox },
    { id: "requests", label: "Requests", count: counts.requests },
  ];

  return (
    <div className="flex rounded-[22px] border border-slate-200 bg-white p-2 shadow-sm">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`flex-1 rounded-2xl px-4 py-2.5 text-sm font-black transition ${
            active === tab.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {tab.label}
          {tab.count ? <span className="ml-2 rounded-full bg-white/20 px-2 text-xs">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
