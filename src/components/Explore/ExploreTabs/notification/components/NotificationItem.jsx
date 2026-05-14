import {
  HiOutlineArrowPathRoundedSquare,
  HiOutlineBellAlert,
  HiOutlineBookmark,
  HiOutlineChatBubbleOvalLeft,
  HiOutlineExclamationTriangle,
  HiOutlineFire,
  HiOutlineHandThumbUp,
  HiOutlineShieldCheck,
  HiOutlineUserPlus,
} from "react-icons/hi2";
import Avatar from "../../../shared/Avatar";
import NotificationAction from "./NotificationAction";

function getIcon(type) {
  if (type === "follow") return HiOutlineUserPlus;
  if (type === "like" || type === "reaction") return HiOutlineHandThumbUp;
  if (type === "comment" || type === "reply" || type === "creator_reply" || type === "thread_reply" || type === "mention") return HiOutlineChatBubbleOvalLeft;
  if (type === "save") return HiOutlineBookmark;
  if (type === "share") return HiOutlineArrowPathRoundedSquare;
  if (type === "post_trending" || type === "video_milestone" || type === "profile_milestone" || type === "follower_milestone") return HiOutlineFire;
  if (type === "new_login" || type === "password_changed" || type === "verification_approved") return HiOutlineShieldCheck;
  if (type === "report_update" || type === "moderation_action") return HiOutlineExclamationTriangle;
  return HiOutlineBellAlert;
}

function getMessage(item) {
  if (item.groupedCount > 1 && item.groupedItems?.length) {
    const firstActor = item.groupedItems[0]?.actor_name || "Someone";
    const others = Math.max(0, item.groupedCount - 1);
    const mediaType = item.media_type || "post";
    const action = item.type === "share" ? "shared" : item.type === "save" ? "saved" : "liked";
    return `${firstActor} and ${others} ${others === 1 ? "other" : "others"} ${action} your ${mediaType}`;
  }

  if (item.message) {
    return item.message;
  }

  const name = item.actor_name || item.user || "Someone";
  const mediaType = item.media_type || "post";

  if (item.type === "follow") return `${name} started following you`;
  if (item.type === "like") return `${name} reacted to your ${mediaType}`;
  if (item.type === "reaction") return `${name} reacted to your ${mediaType}`;
  if (item.type === "comment") return `${name} joined the conversation on your ${mediaType}`;
  if (item.type === "reply") return `${name} replied to your comment`;
  if (item.type === "creator_reply") return `${name} replied to your comment`;
  if (item.type === "thread_reply") return `${name} added a new reply in a thread you joined`;
  if (item.type === "mention") return `${name} mentioned you`;
  if (item.type === "tag") return `${name} tagged you in a ${mediaType}`;
  if (item.type === "save") return `${name} bookmarked your ${mediaType}`;
  if (item.type === "share") return `${name} shared your ${mediaType}`;
  return `${name} interacted with your account`;
}

function getPriorityPill(priority) {
  if (priority === "high") return "Now";
  if (priority === "medium") return "Quiet";
  return "";
}

export default function NotificationItem({ followed, item, onFollowBack, onOpen }) {
  const Icon = getIcon(item.type);
  const priorityPill = getPriorityPill(item.priority);

  return (
    <article
      className={`flex w-full gap-3 rounded-[22px] border px-4 py-4 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        item.read ? "border-slate-200 bg-white" : "border-sky-100 bg-sky-50/90"
      }`}
    >
      <div className="relative h-12 w-12 shrink-0">
        <Avatar name={item.actor_name || "KunThai"} src={item.actor_avatar_url || ""} size="md" />
        <span className={`absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full text-[13px] shadow-sm ${item.read ? "bg-slate-100 text-slate-600" : "bg-sky-600 text-white"}`}>
          <Icon />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => onOpen?.(item)} className="w-full text-left">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-sm font-bold leading-6 text-slate-800">{getMessage(item)}</p>
            {!item.read ? <span className="mt-2 h-2.5 w-2.5 flex-none rounded-full bg-sky-600" /> : null}
          </div>
          {item.post_preview ? <p className="mt-1 line-clamp-2 text-xs font-medium text-slate-500">"{item.post_preview}"</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold text-slate-400">{item.time_label || item.time}</p>
            {priorityPill ? (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${
                item.priority === "high" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"
              }`}>
                {priorityPill}
              </span>
            ) : null}
          </div>
        </button>
        <NotificationAction followed={followed} onFollowBack={() => onFollowBack?.(item)} type={item.type} />
      </div>
    </article>
  );
}
