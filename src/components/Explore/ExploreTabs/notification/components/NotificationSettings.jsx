import { HiOutlineBellAlert, HiOutlineChatBubbleOvalLeft, HiOutlineHandThumbUp, HiOutlineRectangleStack, HiOutlineUserPlus } from "react-icons/hi2";

const settings = [
  { key: "reactions", label: "Reactions", icon: HiOutlineHandThumbUp },
  { key: "comments", label: "Comments", icon: HiOutlineChatBubbleOvalLeft },
  { key: "follows", label: "Follows", icon: HiOutlineUserPlus },
  { key: "followedPosts", label: "Posts", icon: HiOutlineRectangleStack },
  { key: "safetyAlerts", label: "Alerts", icon: HiOutlineBellAlert },
];

export default function NotificationSettings({ values, onToggle }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {settings.map((item) => {
        const Icon = item.icon;
        const active = values[item.key] !== false;
        return (
          <button
            key={item.key}
            type="button"
            role="switch"
            aria-checked={active}
            onClick={() => onToggle(item.key)}
            className={`flex h-14 items-center justify-between gap-3 rounded-2xl border px-3 text-left transition ${
              active ? "border-sky-100 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-500"
            }`}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-full text-lg ${active ? "bg-white text-sky-700 shadow-sm" : "bg-slate-100 text-slate-400"}`}>
                <Icon />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-black">{item.label}</span>
                <span className={`block text-[11px] font-black uppercase tracking-[0.14em] ${active ? "text-sky-600" : "text-slate-400"}`}>
                  {active ? "On" : "Off"}
                </span>
              </span>
            </span>
            <span className={`relative h-7 w-12 flex-none rounded-full p-1 transition ${active ? "bg-sky-600" : "bg-slate-300"}`}>
              <span className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${active ? "translate-x-5" : "translate-x-0"}`} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
