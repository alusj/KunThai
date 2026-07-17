import { formatMessageTime } from "../../../../../Backend/utils/formatMessageTime";

function conversationTitle(conversation) {
  if (conversation.productName) {
    return `${conversation.buyerName} sent you a message about ${conversation.productName}`;
  }

  return `${conversation.buyerName} sent you a message`;
}

export default function ConversationItem({ conversation, onOpen, active }) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(conversation)}
      className={`w-full rounded-lg border p-4 text-left transition ${
        conversation.unread
          ? "border-emerald-200 bg-emerald-50/90 hover:bg-emerald-100/80"
          : active
            ? "border-gray-300 bg-gray-50"
            : "border-gray-200 bg-white hover:bg-gray-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="line-clamp-2 font-black text-gray-950">{conversationTitle(conversation)}</p>
          </div>
          <p className="mt-1 text-xs font-bold uppercase text-gray-400">{conversation.productName ? "Product message" : "UrMall message"}</p>
        </div>
        <span className="shrink-0 text-xs font-bold text-gray-400">{formatMessageTime(conversation.time)}</span>
      </div>

      <p className="mt-3 text-sm font-medium leading-5 text-gray-600">
        {conversation.preview}
      </p>

      <p className="mt-3 text-xs font-black text-emerald-700">Open conversation</p>
    </button>
  );
}
