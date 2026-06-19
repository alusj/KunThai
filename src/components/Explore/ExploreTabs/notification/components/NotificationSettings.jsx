import {
  HiOutlineAtSymbol,
  HiOutlineBellAlert,
  HiOutlineChatBubbleOvalLeft,
  HiOutlineFire,
  HiOutlineHandThumbUp,
  HiOutlineRectangleStack,
  HiOutlineUserPlus,
} from "react-icons/hi2";
import { MessageCircle } from "lucide-react";

const settings = [
  { key: "reactions", label: "Reactions", detail: "Likes, saves, shares, and reactions", icon: HiOutlineHandThumbUp },
  { key: "comments", label: "Comments & replies", detail: "Comments, replies, and thread activity", icon: HiOutlineChatBubbleOvalLeft },
  { key: "mentions", label: "Mentions & tags", detail: "Posts or comments that include your @username", icon: HiOutlineAtSymbol },
  { key: "follows", label: "Follows & connections", detail: "New followers and connection activity", icon: HiOutlineUserPlus },
  { key: "messages", label: "Messages", detail: "New private messages and requests", icon: MessageCircle },
  { key: "followedPosts", label: "New posts", detail: "Posts from accounts you follow", icon: HiOutlineRectangleStack },
  { key: "milestones", label: "Milestones", detail: "Trending posts, views, and profile growth", icon: HiOutlineFire },
  { key: "safetyAlerts", label: "Safety & account", detail: "Security, verification, reports, and moderation", icon: HiOutlineBellAlert },
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
            className={`flex min-h-16 items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left transition ${
              active ? "border-sky-100 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-500"
            }`}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-full text-lg ${active ? "bg-white text-sky-700 shadow-sm" : "bg-slate-100 text-slate-400"}`}>
                <Icon />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-black">{item.label}</span>
                <span className="block truncate text-[11px] font-semibold text-slate-500">{item.detail}</span>
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
