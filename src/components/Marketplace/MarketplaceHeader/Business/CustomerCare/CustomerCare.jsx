import { useSellerCustomerCare } from "../../../../../Backend/hooks/useSellerCustomerCare";
import RecentConversations from "./RecentConversations";
import { useEffect, useRef, useState } from "react";
import { markSellerConversationRead, sendSellerMarketplaceMessage } from "../../../../../Backend/services/marketplace/sellerCustomerCareService";
import AppBackTab from "../../../../shared/AppBackTab";

const CONVERSATION_TRANSITION_MS = 360;

export default function CustomerCare({ onBack } = {}) {
  const { conversations, loading, reload } = useSellerCustomerCare();
  const [activeConversation, setActiveConversation] = useState(null);
  const [closingConversation, setClosingConversation] = useState(null);
  const [conversationAction, setConversationAction] = useState("idle");
  const [reply, setReply] = useState("");
  const [feedback, setFeedback] = useState("");
  const transitionTimerRef = useRef(null);
  const visibleConversation = activeConversation || closingConversation;
  const standalone = Boolean(onBack);

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

  function closeConversation() {
    if (!activeConversation) return;

    clearTransitionTimer();
    setClosingConversation(activeConversation);
    setActiveConversation(null);
    setConversationAction("pop");
    transitionTimerRef.current = window.setTimeout(() => {
      setClosingConversation(null);
      setConversationAction("idle");
      transitionTimerRef.current = null;
    }, CONVERSATION_TRANSITION_MS);
  }

  function renderListHeader() {
    if (!standalone) return null;

    return (
      <header className="kt-header-glass flex h-16 shrink-0 items-center gap-3 px-3 sm:px-4">
        <AppBackTab
          onBack={onBack}
          label="Back to seller dashboard"
          historyKey="marketplace-seller-messages"
          useHistoryLayer={false}
        />
        <div className="min-w-0">
          <p className="text-xs font-black uppercase text-emerald-700">Messages</p>
          <h1 className="truncate text-lg font-black text-gray-950">Buyer Messages</h1>
          <p className="truncate text-xs font-bold text-gray-500">Reply to product inquiries and customer messages.</p>
        </div>
      </header>
    );
  }

  if (loading) {
    return (
      <section className={standalone ? "flex h-dvh flex-col bg-gray-50" : "rounded-xl border border-gray-200 bg-white p-5 shadow-sm"} aria-busy="true">
        {renderListHeader()}
        <div className={standalone ? "min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8" : ""}>
          <div className={standalone ? "rounded-xl border border-gray-200 bg-white p-5 shadow-sm" : ""}>
            <div className="h-5 w-44 animate-pulse rounded bg-gray-200" />
            <div className="mt-4 space-y-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-16 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
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

  async function openConversation(conversation) {
    clearTransitionTimer();
    setFeedback("");
    setClosingConversation(null);
    setConversationAction("push");
    setActiveConversation({ ...conversation, unread: false });
    transitionTimerRef.current = window.setTimeout(() => {
      setConversationAction("idle");
      transitionTimerRef.current = null;
    }, CONVERSATION_TRANSITION_MS);

    if (!conversation.unread) {
      return;
    }

    try {
      await markSellerConversationRead(conversation);
      await reload?.();
    } catch {
      // The conversation is still readable even if the read receipt cannot sync.
    }
  }

  function renderConversation(conversation) {
    if (!conversation) return null;

    const panelClass = conversationAction === "push"
      ? "kt-explore-stack-enter"
      : conversationAction === "pop"
        ? "kt-explore-stack-leave-right"
        : "translate-x-0";

    return (
      <section className={`absolute inset-0 z-10 flex flex-col bg-gray-50 ${panelClass}`}>
        <header className="kt-header-glass flex h-16 shrink-0 items-center gap-3 px-3 sm:px-4">
          <AppBackTab
            onBack={closeConversation}
            label="Back to messages"
            historyKey="marketplace-seller-message-conversation"
            useHistoryLayer={false}
          />
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-emerald-700">
              {conversation.productName ? "Product message" : "UrMall message"}
            </p>
            <h3 className="truncate text-lg font-black text-gray-950">{conversation.buyerName || "Buyer"}</h3>
            <p className="truncate text-xs font-bold text-gray-500">{conversation.topic || conversation.preview}</p>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
          {conversation.messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm font-medium shadow-sm ${
                message.from === "seller"
                  ? "ml-auto bg-emerald-600 text-white"
                  : "border border-gray-200 bg-white text-gray-700"
              }`}
            >
              {message.text}
            </div>
          ))}
        </div>

        {feedback && <p className="mx-4 shrink-0 rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-700 sm:mx-6 lg:mx-8">{feedback}</p>}

        <form onSubmit={sendReply} className="shrink-0 border-t border-gray-200 bg-white p-3">
          <div className="flex w-full gap-2">
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
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className={`relative overflow-hidden bg-gray-50 ${standalone ? "h-dvh" : "min-h-[calc(100dvh-9rem)]"}`}>
      <section
        aria-hidden={Boolean(visibleConversation)}
        inert={visibleConversation ? "true" : undefined}
        className={`absolute inset-0 ${standalone ? "flex flex-col" : "overflow-y-auto"}`}
      >
        {renderListHeader()}
        <div className={standalone ? "min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8" : ""}>
          <RecentConversations conversations={conversations} onOpen={openConversation} activeId={activeConversation?.id} />
        </div>
      </section>
      {renderConversation(visibleConversation)}
    </section>
  );
}
