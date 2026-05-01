import ConversationItem from "./ConversationItem";

export default function RecentConversations({ conversations }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-black text-gray-950">Recent conversations</h3>
        <button
          type="button"
          className="text-sm font-black text-blue-700 hover:text-blue-800"
          onClick={() => console.log("View all conversations")}
        >
          View all
        </button>
      </div>

      <div className="space-y-3">
        {conversations.map((conversation) => (
          <ConversationItem key={conversation.id} conversation={conversation} />
        ))}
      </div>
    </section>
  );
}
