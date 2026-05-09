import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import {
  fetchBuyerMessages,
  sendBuyerMarketplaceMessage,
} from "../../Backend/services/marketplace/buyerMarketplaceService";
import AppBackButton from "../shared/AppBackButton";

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Messages({ onBack, onProductOpen }) {
  const [messages, setMessages] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const activeMessage = useMemo(
    () => messages.find((message) => message.id === activeId) || messages[0] || null,
    [activeId, messages],
  );

  async function loadMessages() {
    setLoading(true);
    setError("");

    try {
      const rows = await fetchBuyerMessages();
      setMessages(rows);
      setActiveId((current) => current || rows[0]?.id || "");
    } catch (err) {
      setError(err.message || "Unable to load messages.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMessages();
  }, []);

  async function sendReply(event) {
    event.preventDefault();
    if (!draft.trim() || !activeMessage) return;

    try {
      await sendBuyerMarketplaceMessage({
        seller: { id: activeMessage.businessId },
        product: activeMessage.productId
          ? { id: activeMessage.productId, name: activeMessage.productName, businessId: activeMessage.businessId }
          : null,
        topic: activeMessage.topic,
        message: draft,
        messageType: activeMessage.type,
      });
      setDraft("");
      setNotice("Message sent.");
      await loadMessages();
    } catch (err) {
      setNotice(err.message || "Unable to send message.");
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-white px-4">
        <AppBackButton onBack={onBack} label="Back to marketplace" historyKey="marketplace-messages" />
        <div>
          <h1 className="text-lg font-black text-gray-950">Messages</h1>
          <p className="text-xs font-bold text-gray-500">Buyer conversations with marketplace sellers</p>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <h2 className="mb-3 font-black text-gray-950">Conversations</h2>
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
          {!loading && !error && !messages.length && (
            <div className="rounded-lg bg-gray-50 p-5 text-center">
              <MessageCircle className="mx-auto text-gray-400" size={32} />
              <p className="mt-2 text-sm font-black text-gray-950">No messages yet</p>
              <p className="mt-1 text-xs font-medium text-gray-500">Messages you send to sellers will appear here.</p>
            </div>
          )}
          <div className="space-y-2">
            {messages.map((message) => (
              <button
                key={message.id}
                onClick={() => setActiveId(message.id)}
                className={`w-full rounded-lg p-3 text-left transition ${
                  activeMessage?.id === message.id ? "bg-emerald-50 ring-1 ring-emerald-200" : "hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-black text-gray-950">{message.sellerName}</p>
                  <span className="text-xs font-bold text-gray-400">{formatDate(message.createdAt)}</span>
                </div>
                <p className="mt-1 truncate text-xs font-bold text-gray-500">{message.topic}</p>
                <p className="mt-1 line-clamp-2 text-xs font-medium text-gray-500">{message.preview}</p>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-h-[70vh] flex-col rounded-lg border border-gray-200 bg-white shadow-sm">
          {activeMessage ? (
            <>
              <div className="border-b p-4">
                <h2 className="font-black text-gray-950">{activeMessage.topic}</h2>
                <p className="mt-1 text-sm font-bold text-gray-500">
                  {activeMessage.sellerName}
                  {activeMessage.productName ? " - " : ""}
                  {activeMessage.productName ? (
                    <button
                      type="button"
                      onClick={() =>
                        onProductOpen?.({
                          id: activeMessage.productId,
                          businessId: activeMessage.businessId,
                          name: activeMessage.productName,
                        })
                      }
                      className="font-black text-emerald-700 hover:text-emerald-800 hover:underline"
                    >
                      {activeMessage.productName}
                    </button>
                  ) : null}
                </p>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {activeMessage.messages.map((message) => {
                  const fromBuyer = message.from === "buyer";

                  return (
                    <div
                      key={message.id}
                      className={`max-w-[84%] rounded-2xl px-4 py-3 text-sm font-medium ${
                        fromBuyer
                          ? "ml-auto bg-emerald-600 text-white"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {message.text}
                    </div>
                  );
                })}
              </div>

              {notice && <p className="mx-4 rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{notice}</p>}

              <form onSubmit={sendReply} className="flex gap-2 border-t p-3">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Type your message..."
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700"
                >
                  <Send size={16} />
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <div>
                <MessageCircle className="mx-auto text-gray-400" size={36} />
                <p className="mt-3 font-black text-gray-950">Choose a conversation</p>
                <p className="mt-1 text-sm font-medium text-gray-500">Your buyer-seller messages will open here.</p>
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
