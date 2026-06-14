import AppBackTab from "../../../shared/AppBackTab";
import { useEffect, useRef } from "react";
import Avatar from "../../shared/Avatar";
import MessageBubble from "./MessageBubble";
import MessageComposer from "./MessageComposer";

function getOtherParticipant(conversation, currentUserId) {
  const otherId = conversation.participantIds?.find((id) => id !== currentUserId);
  return conversation.participants?.[otherId] || {};
}

export default function ConversationScreen({ conversation, currentUserId, messages, onAction, onActivity, onBack, onSend, onViewProfile }) {
  const user = getOtherParticipant(conversation, currentUserId);
  const messagesRef = useRef(null);

  function viewProfile() {
    onViewProfile?.({
      userId: user.userId || "",
      displayName: user.displayName || "Profile",
      username: user.username || "",
      avatarUrl: user.avatarUrl || "",
      accountType: "personal",
    });
  }

  useEffect(() => {
    const node = messagesRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  return (
    <section className="flex h-dvh min-w-0 flex-col overflow-hidden bg-white">
      <div className="flex min-w-0 items-center gap-3 border-b border-slate-200 px-4 py-3">
        <AppBackTab onBack={onBack} label="Back to inbox" historyKey="explore-conversation" />
        <button type="button" onClick={viewProfile} className="flex-none" aria-label={`View ${user.displayName || "Profile"} profile`}>
          <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
        </button>
        <div className="min-w-0">
          <button type="button" onClick={viewProfile} className="block max-w-full truncate text-left text-sm font-black text-slate-950 hover:text-sky-700">
            {user.displayName || "Profile"}
          </button>
          <button type="button" onClick={viewProfile} className="block max-w-full truncate text-left text-xs font-bold text-slate-500 hover:text-sky-700">
            @{user.username || "user"}
          </button>
        </div>
      </div>

      <div ref={messagesRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4 kuntai-scrollbar-none">
        {!messages.length ? (
          <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-6 text-center">
            <p className="text-sm font-black text-slate-950">Start the conversation</p>
            <p className="mt-1 text-sm text-slate-500">Say hello, ask a question, or continue from their profile.</p>
          </div>
        ) : null}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            mine={message.senderId === currentUserId}
            otherUserName={user.displayName || user.username || "This user"}
            onApproveLocationRequest={() => onAction?.("approveLocationRequest", { message, userId: user.userId })}
            onBlockUser={() => onAction?.("blockUser", { message, userId: user.userId })}
            onOpenSharedLocation={() => onAction?.("openSharedLocation", { message, userId: user.userId })}
          />
        ))}
      </div>

      <MessageComposer onAction={onAction} onActivity={onActivity} onSend={onSend} />
    </section>
  );
}
