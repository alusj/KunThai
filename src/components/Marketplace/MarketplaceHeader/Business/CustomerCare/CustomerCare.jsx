import { useSellerCustomerCare } from "../../../../../Backend/hooks/useSellerCustomerCare";
import RecentConversations from "./RecentConversations";
import { useState } from "react";
import { sendSellerMarketplaceMessage } from "../../../../../Backend/services/marketplace/sellerCustomerCareService";

function conversationTitle(conversation) {
  if (conversation?.productName) {
    return `${conversation.buyerName} sent a message about ${conversation.productName}`;
  }

  return `${conversation?.buyerName || "Buyer"} sent you a message`;
}

export default function CustomerCare() {
  const { conversations, loading, reload } = useSellerCustomerCare();
  const [activeConversation, setActiveConversation] = useState(null);
  const [reply, setReply] = useState("");
  const [feedback, setFeedback] = useState("");

  if (loading) {
    return <div className="h-80 rounded-xl bg-white shadow-sm" />;
  }

  async function sendReply(event) {
    event.preventDefault();
    if (!reply.trim() || !activeConversation) return;

    try {
      await sendSellerMarketplaceMessage(activeConversation, reply);
      setReply("");
      setFeedback("Reply sent to buyer.");
      await reload?.();
    } catch (err) {
      setFeedback(err.message || "Unable to send reply.");
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      {!activeConversation ? (
        <RecentConversations conversations={conversations} onOpen={(conversation) => {
          setFeedback("");
          setActiveConversation(conversation);
        }} activeId={activeConversation?.id} />
      ) : (
        <section className="flex min-h-[70vh] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-gray-200 pb-4">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase text-emerald-700">
                {activeConversation.productName ? "Product message" : "Marketplace message"}
              </p>
              <h3 className="mt-1 text-lg font-black text-gray-950">{conversationTitle(activeConversation)}</h3>
              <p className="mt-1 text-sm font-bold text-gray-500">{activeConversation.preview}</p>
            </div>
            <button
              type="button"
              onClick={() => setActiveConversation(null)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-black text-gray-600 hover:bg-gray-100"
            >
              Back
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gray-50 px-3 py-4">
            {activeConversation.messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[82%] rounded-2xl px-4 py-2 text-sm font-medium ${
                  message.from === "seller"
                    ? "ml-auto bg-emerald-600 text-white"
                    : "bg-white text-gray-700 shadow-sm"
                }`}
              >
                {message.text}
              </div>
            ))}
          </div>

          {feedback && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{feedback}</p>}

          <form onSubmit={sendReply} className="mt-3 flex gap-2 border-t border-gray-200 pt-3">
            <input
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              placeholder="Reply to buyer..."
              className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={!reply.trim()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reply
            </button>
          </form>
        </section>
      )}
    </section>
  );
}
