import Avatar from "../../shared/Avatar";

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

export default function ConversationRow({ conversation, currentUserId, onOpen, onViewProfile }) {
  const user = getOtherParticipant(conversation, currentUserId);

  function viewProfile(event) {
    event.stopPropagation();
    onViewProfile?.({
      userId: user.userId || "",
      displayName: user.displayName || "Profile",
      username: user.username || "",
      avatarUrl: user.avatarUrl || "",
      accountType: "personal",
    });
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(conversation)}
      className={`flex w-full items-center gap-3 rounded-[24px] border p-4 text-left shadow-sm transition ${
        conversation.unreadCount
          ? "border-sky-100 bg-sky-50/90 hover:bg-sky-100/80"
          : "border-slate-200 bg-white hover:bg-slate-50"
      }`}
    >
      <span role="button" tabIndex={0} onClick={viewProfile} onKeyDown={(event) => event.key === "Enter" && viewProfile(event)} className="flex-none" aria-label={`View ${user.displayName || "Profile"} profile`}>
        <Avatar name={user.displayName} src={user.avatarUrl} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span role="button" tabIndex={0} onClick={viewProfile} onKeyDown={(event) => event.key === "Enter" && viewProfile(event)} className="truncate text-sm font-black text-slate-950 hover:text-sky-700">
            {user.displayName || "Profile"}
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
  );
}
