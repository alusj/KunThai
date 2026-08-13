import Avatar from "../../shared/Avatar";
import { t as i18nText } from "../../../../i18n/index";

function getOtherParticipant(conversation, currentUserId) {
  const otherId = conversation.participantIds?.find((id) => id !== currentUserId);
  return conversation.participants?.[otherId] || {};
}

function getConversationPreview(conversation, username) {
  const message = conversation.lastMessage;
  if (message?.body) return message.body;
  if (message?.type === "image") return "Photo";
  if (message?.type === "audio") return "Voice note";
  if (message?.type === "video") return "Video";
  return `@${username || "user"}`;
}

export default function ConversationRow({ conversation, currentUserId, onOpen, onRespond, request = false }) {
  const user = getOtherParticipant(conversation, currentUserId);

  return (
    <div className={`rounded-[24px] border shadow-sm transition ${
        conversation.unreadCount
          ? "border-sky-100 bg-sky-50/90 hover:bg-sky-100/80"
          : "border-slate-200 bg-white hover:bg-slate-50"
      }`}>
      <button type="button" onClick={() => onOpen(conversation)} className="flex w-full items-center gap-3 p-4 text-left" aria-label={i18nText("ui.literals.kee4a237f453a", { value0: user.displayName || i18nText("ui.literals.kff4fc0276e96") })}>
        <span className="flex-none">
          <Avatar name={user.displayName} src={user.avatarUrl} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-black text-slate-950">
              {user.displayName || i18nText("ui.literals.kff4fc0276e96")}
            </span>
            {conversation.unreadCount ? (
              <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-black text-white">{conversation.unreadCount}</span>
            ) : null}
          </span>
          <span className="mt-1 block truncate text-sm font-semibold text-slate-500">
            {getConversationPreview(conversation, user.username)}
          </span>
        </span>
      </button>
      {request ? (
        <div className="flex gap-2 border-t border-slate-200 px-4 py-3">
          <button type="button" onClick={() => onRespond?.(conversation, true)} className="flex-1 rounded-2xl bg-sky-700 px-4 py-2.5 text-sm font-black text-white">
            {i18nText("ui.literals.kbb54db510a92")}
          </button>
          <button type="button" onClick={() => onRespond?.(conversation, false)} className="flex-1 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-black text-slate-700">
            {i18nText("ui.literals.ke963907dac5c")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
