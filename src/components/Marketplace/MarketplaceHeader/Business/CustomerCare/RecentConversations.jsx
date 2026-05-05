import ConversationItem from "./ConversationItem";

export default function RecentConversations({ conversations, onOpen, activeId }) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-black text-gray-950">Messages</h3>

      <div className="space-y-3">
        {conversations.length ? (
          conversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              onOpen={onOpen}
              active={activeId === conversation.id}
            />
          ))
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
            <p className="font-black text-gray-950">No messages yet</p>
            <p className="mt-1 text-sm font-medium text-gray-500">Buyer messages will appear here.</p>
          </div>
        )}
      </div>
    </section>
  );
}
