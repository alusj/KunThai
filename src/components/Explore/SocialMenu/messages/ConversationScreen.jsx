import { HiOutlineArrowLeft } from "react-icons/hi2";

import Avatar from "../../shared/Avatar";
import MessageBubble from "./MessageBubble";
import MessageComposer from "./MessageComposer";

function getOtherParticipant(conversation, currentUserId) {
  const otherId = conversation.participantIds?.find((id) => id !== currentUserId);
  return conversation.participants?.[otherId] || {};
}

export default function ConversationScreen({ conversation, currentUserId, messages, onBack, onSend }) {
  const user = getOtherParticipant(conversation, currentUserId);

  return (
    <section className="flex h-[calc(100vh-112px)] flex-col overflow-hidden bg-white">
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-700"
          aria-label="Back to inbox"
        >
          <HiOutlineArrowLeft />
        </button>
        <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-950">{user.displayName || "KunThai User"}</p>
          <p className="truncate text-xs font-bold text-slate-500">@{user.username || "user"}</p>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
        {!messages.length ? (
          <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-6 text-center">
            <p className="text-sm font-black text-slate-950">Start the conversation</p>
            <p className="mt-1 text-sm text-slate-500">Say hello, ask a question, or continue from their profile.</p>
          </div>
        ) : null}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} mine={message.senderId === currentUserId} />
        ))}
      </div>

      <MessageComposer onSend={onSend} />
    </section>
  );
}
