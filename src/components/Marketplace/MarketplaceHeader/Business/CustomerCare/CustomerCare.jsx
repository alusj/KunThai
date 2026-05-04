import { useSellerCustomerCare } from "../../../../../Backend/hooks/useSellerCustomerCare";
import CareMetricsGrid from "./CareMetricsGrid";
import RecentConversations from "./RecentConversations";
import SupportThreads from "./SupportThreads";
import { useState } from "react";
import { sendSellerMarketplaceMessage } from "../../../../../Backend/services/marketplace/sellerCustomerCareService";

export default function CustomerCare() {
  const { metrics, conversations, supportThreads, loading, reload } = useSellerCustomerCare();
  const [activeConversation, setActiveConversation] = useState(null);
  const [reply, setReply] = useState("");
  const [feedback, setFeedback] = useState("");

  if (loading || !metrics) {
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
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-black uppercase text-blue-700">Customer Care</p>
        <h3 className="mt-1 text-xl font-black text-gray-950">
          Messages & buyer support
        </h3>
        <p className="mt-1 text-sm font-medium text-gray-500">
          Keep replies fast, negotiations clear, and disputes under control.
        </p>
      </div>

      <CareMetricsGrid metrics={metrics} />
      <RecentConversations conversations={conversations} onOpen={setActiveConversation} activeId={activeConversation?.id} />

      {activeConversation && (
        <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-black text-gray-950">{activeConversation.buyerName}</h3>
              <p className="mt-1 text-sm font-bold text-gray-500">{activeConversation.topic}</p>
            </div>
            <button
              type="button"
              onClick={() => setActiveConversation(null)}
              className="rounded-lg bg-white px-3 py-2 text-xs font-black text-gray-600 hover:bg-gray-100"
            >
              Close
            </button>
          </div>

          <div className="mt-4 max-h-72 space-y-3 overflow-y-auto">
            {activeConversation.messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[82%] rounded-2xl px-4 py-2 text-sm font-medium ${
                  message.from === "seller"
                    ? "ml-auto bg-emerald-600 text-white"
                    : "bg-white text-gray-700"
                }`}
              >
                {message.text}
              </div>
            ))}
          </div>

          {feedback && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{feedback}</p>}

          <form onSubmit={sendReply} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              placeholder="Reply to buyer..."
              className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700"
            >
              Send Reply
            </button>
          </form>
        </section>
      )}

      <SupportThreads threads={supportThreads} />
    </section>
  );
}
