import { HiOutlineSparkles, HiOutlineUserGroup, HiOutlineUsers } from "react-icons/hi2";

export default function ConnectionsSummary({ activeTab = "mycircle", counts, loading = false, onSelect, slideDirection = "forward" }) {
  const items = [
    { id: "mycircle", label: "Connected", value: counts.circle, icon: HiOutlineUserGroup },
    { id: "followers", label: "Connects You", value: counts.followers, icon: HiOutlineUsers },
    { id: "discover", label: "Suggested", value: counts.discover, icon: HiOutlineSparkles },
  ];

  return (
    <div
      className={`grid grid-cols-3 gap-2 ${slideDirection === "backward" ? "kt-parent-tab-slide-backward" : "kt-parent-tab-slide-forward"}`}
      role="tablist"
      aria-label="Connections sections"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = activeTab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect?.(item.id)}
            className={`min-w-0 rounded-[20px] border p-4 text-left shadow-sm transition ${
              active ? "border-sky-200 bg-sky-50 text-sky-800 ring-2 ring-sky-100" : "border-slate-200 bg-white text-slate-600 hover:border-sky-100 hover:bg-sky-50/50"
            }`}
          >
            <Icon className={`text-xl ${active ? "text-sky-700" : "text-sky-700"}`} />
            {loading ? (
              <div className="mt-3 h-8 w-10 animate-pulse rounded-full bg-slate-100" />
            ) : (
              <p className="mt-3 text-2xl font-black text-slate-950">{item.value}</p>
            )}
            <p className={`truncate text-sm font-black ${active ? "text-sky-700" : "text-slate-500"}`}>{item.label}</p>
          </button>
        );
      })}
    </div>
  );
}
