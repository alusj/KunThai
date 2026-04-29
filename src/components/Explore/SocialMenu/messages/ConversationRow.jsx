import Avatar from "../../shared/Avatar";

function getOtherParticipant(conversation, currentUserId) {
  const otherId = conversation.participantIds?.find((id) => id !== currentUserId);
  return conversation.participants?.[otherId] || {};
}

export default function ConversationRow({ conversation, currentUserId, onOpen }) {
  const user = getOtherParticipant(conversation, currentUserId);

  return (
    <button
      type="button"
      onClick={() => onOpen(conversation)}
      className="flex w-full items-center gap-3 rounded-[24px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:bg-slate-50"
    >
      <Avatar name={user.displayName} src={user.avatarUrl} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-black text-slate-950">{user.displayName || "KunThai User"}</span>
          {conversation.unreadCount ? (
            <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-black text-white">{conversation.unreadCount}</span>
          ) : null}
        </span>
        <span className="mt-1 block truncate text-sm font-semibold text-slate-500">
          {conversation.lastMessage?.body || `@${user.username || "user"}`}
        </span>
      </span>
    </button>
  );
}
