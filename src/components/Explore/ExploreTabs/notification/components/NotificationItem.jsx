import { HiOutlineBellAlert, HiOutlineBookmark, HiOutlineChatBubbleOvalLeft, HiOutlineHandThumbUp, HiOutlineUserPlus } from "react-icons/hi2";

function getIcon(type) {
  if (type === "follow") return HiOutlineUserPlus;
  if (type === "like") return HiOutlineHandThumbUp;
  if (type === "comment") return HiOutlineChatBubbleOvalLeft;
  if (type === "mention") return HiOutlineChatBubbleOvalLeft;
  if (type === "save") return HiOutlineBookmark;
  return HiOutlineBellAlert;
}

function getMessage(item) {
  if (item.message) {
    return item.message;
  }

  const name = item.actor_name || item.user || "Someone";
  const mediaType = item.media_type || "post";

  if (item.type === "follow") return `${name} started following you`;
  if (item.type === "like") return `${name} liked your ${mediaType}`;
  if (item.type === "comment") return `${name} commented on your ${mediaType}`;
  if (item.type === "mention") return `${name} mentioned you in a comment`;
  if (item.type === "save") return `${name} saved your ${mediaType}`;
  return `${name} interacted with your account`;
}

export default function NotificationItem({ item, onOpen }) {
  const Icon = getIcon(item.type);

  return (
    <button
      type="button"
      onClick={() => onOpen?.(item)}
      className={`flex w-full gap-3 rounded-[22px] border px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        item.read ? "border-slate-200 bg-white" : "border-sky-100 bg-sky-50"
      }`}
    >
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sky-700 shadow-sm ${item.read ? "bg-slate-50" : "bg-white"}`}>
        <Icon className="text-lg" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-sm font-bold leading-6 text-slate-800">{getMessage(item)}</p>
          {!item.read ? <span className="mt-2 h-2.5 w-2.5 flex-none rounded-full bg-sky-600" /> : null}
        </div>
        {item.post_preview ? <p className="mt-1 line-clamp-2 text-xs font-medium text-slate-500">"{item.post_preview}"</p> : null}
        <p className="mt-2 text-xs font-bold text-slate-400">{item.time_label || item.time}</p>
      </div>
    </button>
  );
}
