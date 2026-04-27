import { HiOutlineBellAlert, HiOutlineChatBubbleOvalLeft, HiOutlineHandThumbUp, HiOutlineUserPlus } from "react-icons/hi2";

const settings = [
  { key: "reactions", label: "Reactions", icon: HiOutlineHandThumbUp },
  { key: "comments", label: "Comments", icon: HiOutlineChatBubbleOvalLeft },
  { key: "follows", label: "Follows", icon: HiOutlineUserPlus },
  { key: "alerts", label: "Alerts", icon: HiOutlineBellAlert },
];

export default function NotificationSettings({ values, onToggle }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {settings.map((item) => {
        const Icon = item.icon;
        const active = values[item.key] !== false;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onToggle(item.key)}
            className={`flex items-center gap-2 rounded-2xl border px-3 py-3 text-sm font-bold transition ${
              active ? "border-sky-100 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-400"
            }`}
          >
            <Icon className="text-lg" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
