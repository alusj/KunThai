import ConversationTypeBadge from "./ConversationTypeBadge";

export default function ConversationItem({ conversation }) {
  return (
    <button
      type="button"
      onClick={() => console.log("Open conversation", conversation.id)}
      className="w-full rounded-lg border border-gray-200 bg-white p-4 text-left transition hover:bg-gray-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black text-gray-950">{conversation.buyerName}</p>
            {conversation.unread ? (
              <span className="h-2 w-2 rounded-full bg-red-500" aria-label="Unread" />
            ) : null}
          </div>
          <p className="mt-1 text-xs font-bold uppercase text-gray-400">
            {conversation.topic}
          </p>
        </div>
        <span className="text-xs font-bold text-gray-400">{conversation.time}</span>
      </div>

      <p className="mt-3 text-sm font-medium leading-5 text-gray-600">
        {conversation.preview}
      </p>

      <div className="mt-3">
        <ConversationTypeBadge type={conversation.type} />
      </div>
    </button>
  );
}
