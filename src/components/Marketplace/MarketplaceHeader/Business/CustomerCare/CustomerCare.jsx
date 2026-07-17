import { useSellerCustomerCare } from "../../../../../Backend/hooks/useSellerCustomerCare";
import RecentConversations from "./RecentConversations";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Send, X } from "lucide-react";
import {
  markSellerConversationRead,
  sendSellerMarketplaceMessage,
  subscribeSellerMarketplaceMessages,
} from "../../../../../Backend/services/marketplace/sellerCustomerCareService";
import { formatMessageTime } from "../../../../../Backend/utils/formatMessageTime";
import AppBackTab from "../../../../shared/AppBackTab";

const CONVERSATION_TRANSITION_MS = 360;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read selected file."));
    reader.readAsDataURL(file);
  });
}

export default function CustomerCare({ onBack } = {}) {
  const { conversations, loading, reload } = useSellerCustomerCare();
  const [activeId, setActiveId] = useState("");
  const [closingConversation, setClosingConversation] = useState(null);
  const [conversationAction, setConversationAction] = useState("idle");
  const [reply, setReply] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [sendError, setSendError] = useState("");
  const [sending, setSending] = useState(false);
  // Optimistic copies of just-sent messages, keyed by conversation id, so a
  // reply shows in the thread immediately without waiting for a reload.
  const [echoes, setEchoes] = useState([]);
  const transitionTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const threadEndRef = useRef(null);
  const standalone = Boolean(onBack);

  const activeConversation = useMemo(
    () => (activeId ? conversations.find((conversation) => conversation.id === activeId) || null : null),
    [activeId, conversations],
  );
  const visibleConversation = activeConversation || closingConversation;

  const threadMessages = useMemo(() => {
    if (!visibleConversation) return [];
    const serverMessages = visibleConversation.messages || [];
    const serverIds = new Set(serverMessages.map((message) => message.id));
    const pending = echoes
      .filter((echo) => echo.conversationId === visibleConversation.id && !serverIds.has(echo.message.id))
      .map((echo) => echo.message);
    return [...serverMessages, ...pending].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }, [echoes, visibleConversation]);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        window.clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let unsubscribe = null;
    let active = true;

    subscribeSellerMarketplaceMessages(() => reload?.())
      .then((cleanup) => {
        if (active) {
          unsubscribe = cleanup;
        } else {
          cleanup?.();
        }
      })
      .catch(() => {
        // Realtime is an enhancement; window events still refresh the list.
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [reload]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [threadMessages.length, activeId]);

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
    setActiveId("");
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

  async function handleImageSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      setSendError("Please select an image file.");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAttachment({ dataUrl, name: file.name || "Selected photo" });
      setSendError("");
    } catch (err) {
      setSendError(err.message || "Unable to prepare this image.");
    }
  }

  async function sendReply(event) {
    event.preventDefault();
    const text = reply.trim();
    const conversation = activeConversation;
    if ((!text && !attachment) || !conversation || sending) return;

    const pendingAttachment = attachment;
    const tempId = `pending-${Date.now()}`;
    const optimisticMessage = {
      id: tempId,
      from: "seller",
      text,
      mediaUrl: pendingAttachment?.dataUrl || "",
      mediaType: pendingAttachment ? "image" : "text",
      createdAt: new Date().toISOString(),
      pending: true,
    };

    setEchoes((current) => [...current, { conversationId: conversation.id, message: optimisticMessage }]);
    setReply("");
    setAttachment(null);
    setSendError("");
    setSending(true);

    try {
      const savedMessage = await sendSellerMarketplaceMessage(conversation, text, {
        mediaUrl: pendingAttachment?.dataUrl || "",
      });
      setEchoes((current) =>
        current.map((echo) => (echo.message.id === tempId ? { ...echo, message: savedMessage } : echo)),
      );
      reload?.();
    } catch (err) {
      setEchoes((current) => current.filter((echo) => echo.message.id !== tempId));
      setReply(text);
      setAttachment(pendingAttachment);
      setSendError(err.message || "Unable to send reply.");
    } finally {
      setSending(false);
    }
  }

  async function openConversation(conversation) {
    clearTransitionTimer();
    setSendError("");
    setClosingConversation(null);
    setConversationAction("push");
    setActiveId(conversation.id);
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
    const canSend = Boolean(reply.trim() || attachment) && !sending;

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
          {threadMessages.map((message) => {
            const fromSeller = message.from === "seller";

            return (
              <div
                key={message.id}
                className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm font-medium shadow-sm ${
                  fromSeller
                    ? "ml-auto bg-emerald-600 text-white"
                    : "border border-gray-200 bg-white text-gray-700"
                }`}
              >
                {message.mediaType === "image" && message.mediaUrl ? (
                  <img src={message.mediaUrl} alt="Message attachment" className="mb-2 max-h-72 w-full rounded-xl object-cover" />
                ) : null}
                {message.text ? <p>{message.text}</p> : null}
                <span className={`mt-1 block text-[10px] font-bold ${fromSeller ? "text-white/70" : "text-gray-400"}`}>
                  {message.pending ? "Sending..." : formatMessageTime(message.createdAt)}
                </span>
              </div>
            );
          })}
          <div ref={threadEndRef} />
        </div>

        {sendError && <p className="mx-4 shrink-0 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700 sm:mx-6 lg:mx-8">{sendError}</p>}

        <form onSubmit={sendReply} className="shrink-0 border-t border-gray-200 bg-white p-3">
          {attachment ? (
            <div className="mb-2 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-2">
              <img src={attachment.dataUrl} alt="Selected attachment" className="h-12 w-12 rounded-lg object-cover" />
              <p className="min-w-0 flex-1 truncate text-sm font-black text-gray-950">Photo ready to send</p>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-gray-500"
                aria-label="Remove attachment"
              >
                <X size={16} />
              </button>
            </div>
          ) : null}
          <div className="flex w-full gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelected} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200"
              aria-label="Attach image"
            >
              <ImagePlus size={18} />
            </button>
            <input
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              placeholder="Reply to buyer..."
              className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={!canSend}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={16} />
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
