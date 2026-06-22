import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import {
  fetchBuyerMessages,
  markBuyerMarketplaceConversationRead,
  sendBuyerMarketplaceMessage,
} from "../../Backend/services/marketplace/buyerMarketplaceService";
import AppBackTab from "../shared/AppBackTab";

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Messages({ compact = false, onBack, onProductOpen }) {
  const [messages, setMessages] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [closingMessage, setClosingMessage] = useState(null);
  const [screenAction, setScreenAction] = useState("idle");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const transitionTimerRef = useRef(null);

  const activeMessage = useMemo(
    () => (activeId ? messages.find((message) => message.id === activeId) || null : null),
    [activeId, messages],
  );
  const visibleMessage = activeMessage || closingMessage;
  const unreadCount = messages.filter((message) => message.unread).length;

  async function loadMessages() {
    setLoading(true);
    setError("");

    try {
      const rows = await fetchBuyerMessages();
      setMessages(rows);
      setActiveId((current) => (rows.some((row) => row.id === current) ? current : ""));
    } catch (err) {
      setError(err.message || "Unable to load messages.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMessages();
  }, []);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        window.clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  function clearTransitionTimer() {
    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }

  async function openConversation(messageId) {
    clearTransitionTimer();
    setClosingMessage(null);
    setScreenAction("push");
    setActiveId(messageId);
    const conversation = messages.find((message) => message.id === messageId);
    if (conversation?.unread) {
      setMessages((current) => current.map((message) => message.id === messageId ? { ...message, unread: false } : message));
      markBuyerMarketplaceConversationRead(conversation).catch(() => loadMessages());
    }
    transitionTimerRef.current = window.setTimeout(() => {
      setScreenAction("idle");
      transitionTimerRef.current = null;
    }, 360);
  }

  function closeConversation() {
    if (!activeMessage) return;

    clearTransitionTimer();
    setClosingMessage(activeMessage);
    setScreenAction("pop");
    setActiveId("");
    transitionTimerRef.current = window.setTimeout(() => {
      setClosingMessage(null);
      setScreenAction("idle");
      transitionTimerRef.current = null;
    }, 360);
  }

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

  function renderProductLink(message) {
    if (!message.productName || message.productName === message.topic) return null;

    return (
      <>
        {" - "}
        <button
          type="button"
          onClick={() =>
            onProductOpen?.({
              id: message.productId,
              businessId: message.businessId,
              name: message.productName,
            })
          }
          className="font-black text-emerald-700 hover:text-emerald-800 hover:underline"
        >
          {message.productName}
        </button>
      </>
    );
  }

  function renderListScreen() {
    return (
      <section
        aria-hidden={Boolean(visibleMessage)}
        inert={visibleMessage ? "true" : undefined}
        className="absolute inset-0 flex flex-col bg-gray-50"
      >
        <header className="kt-header-glass flex h-16 shrink-0 items-center gap-3 px-3 sm:px-4">
          <AppBackTab onBack={onBack} label="Back to UrMall" historyKey="urmall-messages" useHistoryLayer={false} />
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-emerald-700">UrMall</p>
            <h1 className="truncate text-lg font-black text-gray-950">Messages</h1>
            <p className="truncate text-xs font-bold text-gray-500">Buyer conversations with UrMall sellers</p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="w-full">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-gray-950">Conversations</h2>
              {unreadCount ? <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-black text-white">{unreadCount}</span> : null}
            </div>

            {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}

            {!loading && !error && !messages.length ? (
              <div className="mt-8 rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
                <MessageCircle className="mx-auto text-gray-400" size={36} />
                <p className="mt-3 font-black text-gray-950">No messages yet</p>
                <p className="mt-1 text-sm font-medium text-gray-500">Messages you send to sellers will appear here.</p>
              </div>
            ) : null}

            <div className="space-y-2">
              {messages.map((message) => (
                <button
                  key={message.id}
                  type="button"
                  onClick={() => openConversation(message.id)}
                  className={`kt-touchable w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                    message.unread
                      ? "border-emerald-200 bg-emerald-50/90 hover:bg-emerald-100/80"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-base font-black text-gray-950">
                      {message.sellerName}
                    </p>
                    <span className="shrink-0 text-xs font-bold text-gray-400">{formatDate(message.createdAt)}</span>
                  </div>
                  <p className="mt-1 truncate text-sm font-bold text-gray-500">{message.topic}</p>
                  <p className="mt-1 line-clamp-2 text-sm font-medium leading-6 text-gray-500">{message.preview}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderConversationScreen(message) {
    if (!message) return null;

    const panelClass = screenAction === "push"
      ? "kt-explore-stack-enter"
      : screenAction === "pop"
        ? "kt-explore-stack-leave-right"
        : "translate-x-0";

    return (
      <section className={`absolute inset-0 z-10 flex flex-col bg-gray-50 ${panelClass}`}>
        <header className="kt-header-glass flex h-16 shrink-0 items-center gap-3 px-3 sm:px-4">
          <AppBackTab
            onBack={closeConversation}
            label="Back to messages"
            historyKey="urmall-message-conversation"
            useHistoryLayer={false}
          />
          <div className="min-w-0">
            <p className="truncate text-xs font-black uppercase text-emerald-700">Messages</p>
            <h2 className="truncate text-lg font-black text-gray-950">{message.sellerName}</h2>
            <p className="truncate text-xs font-bold text-gray-500">
              {message.topic}
              {renderProductLink(message)}
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-h-full w-full flex-col gap-3">
            {message.messages.map((item) => {
              const fromBuyer = item.from === "buyer";

              return (
                <div
                  key={item.id}
                  className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm font-medium shadow-sm ${
                    fromBuyer
                      ? "ml-auto bg-emerald-600 text-white"
                      : "border border-gray-200 bg-white text-gray-700"
                  }`}
                >
                  {item.text}
                  <span className={`mt-1 block text-[10px] font-bold ${fromBuyer ? "text-white/70" : "text-gray-400"}`}>
                    {formatDate(item.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {notice ? <p className="mx-4 shrink-0 rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-700 sm:mx-6 lg:mx-8">{notice}</p> : null}

        <form onSubmit={sendReply} className="shrink-0 border-t border-gray-200 bg-white p-3">
          <div className="flex w-full gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Type your message..."
              className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700"
            >
              <Send size={16} />
              Send
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <main className={`relative min-h-0 overflow-hidden bg-gray-50 ${compact ? "h-full" : "h-dvh"}`}>
      {renderListScreen()}
      {renderConversationScreen(visibleMessage)}
    </main>
  );
}
